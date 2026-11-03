import "server-only";

import { isIP } from "node:net";

import { and, eq, gt, isNull, lt } from "drizzle-orm";
import { cookies } from "next/headers";
import type { NextRequest, NextResponse } from "next/server";

import { db } from "../db";
import {
  createSessionToken,
  hashLoginAttemptKey,
  hashPassword,
  hashSessionToken,
  normalizeEmail,
  verifyPassword,
} from "../db/crypto";
import {
  authLoginAttempts,
  authSessions,
  memberships,
  users,
  workspaces,
  type MembershipRole,
} from "../db/schema";

const SESSION_LIFETIME_MS = 12 * 60 * 60 * 1_000;
const LOGIN_WINDOW_MS = 15 * 60 * 1_000;
const LOGIN_MAX_FAILURES = 5;
const LOGIN_BLOCK_MS = 15 * 60 * 1_000;

export class AuthenticationError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(message = "Authentication required.", status = 401, code = "UNAUTHENTICATED") {
    super(message);
    this.name = "AuthenticationError";
    this.status = status;
    this.code = code;
  }
}

export class LoginRateLimitError extends AuthenticationError {
  readonly retryAfterSeconds: number;

  constructor(retryAfterSeconds: number) {
    super("Too many login attempts. Try again later.", 429, "LOGIN_RATE_LIMITED");
    this.name = "LoginRateLimitError";
    this.retryAfterSeconds = Math.max(1, retryAfterSeconds);
  }
}

export type AuthenticatedSession = {
  sessionId: string;
  userId: string;
  membershipId: string;
  workspaceId: string;
  workspaceSlug: string;
  workspaceName: string;
  email: string;
  displayName: string;
  role: MembershipRole;
  expiresAt: Date;
};

export type LoginIdentity = Omit<AuthenticatedSession, "sessionId" | "expiresAt">;

function isSecureCookie(): boolean {
  if (process.env.NODE_ENV === "production") return true;
  return process.env.AUTH_COOKIE_SECURE === "true";
}

export function sessionCookieName(): string {
  return isSecureCookie() ? "__Host-ticketops_session" : "ticketops_session";
}

function configuredSessionLifetimeMs(): number {
  const hours = Number.parseInt(process.env.AUTH_SESSION_HOURS ?? "", 10);
  return Number.isFinite(hours) && hours >= 1 && hours <= 168 ? hours * 60 * 60 * 1_000 : SESSION_LIFETIME_MS;
}

function cookieOptions(expires: Date) {
  return {
    httpOnly: true,
    secure: isSecureCookie(),
    sameSite: "lax" as const,
    path: "/",
    expires,
  };
}

export function getClientAddress(request: Request): string {
  const forwarded = request.headers
    .get("x-forwarded-for")
    ?.split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  // Caddy appends the actual peer address; using the right-most valid hop avoids trusting a spoofed first value.
  const proxyAddress = forwarded?.toReversed().find((value) => isIP(value));
  const realAddress = request.headers.get("x-real-ip")?.trim() || "";
  return proxyAddress || (isIP(realAddress) ? realAddress : "unknown");
}

export async function readBoundedRequestText(request: Request, maxBytes: number): Promise<string> {
  const declared = Number.parseInt(request.headers.get("content-length") ?? "0", 10);
  if (Number.isFinite(declared) && declared > maxBytes) {
    throw new AuthenticationError("Request body is too large.", 413, "PAYLOAD_TOO_LARGE");
  }
  const reader = request.body?.getReader();
  if (!reader) return "";
  const decoder = new TextDecoder();
  let size = 0;
  let text = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) {
        await reader.cancel();
        throw new AuthenticationError("Request body is too large.", 413, "PAYLOAD_TOO_LARGE");
      }
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
    return text;
  } finally {
    reader.releaseLock();
  }
}

export function assertSameOrigin(request: Request): void {
  const method = request.method.toUpperCase();
  if (["GET", "HEAD", "OPTIONS"].includes(method)) return;

  if (request.headers.get("sec-fetch-site") === "cross-site") {
    throw new AuthenticationError("Cross-site request rejected.", 403, "INVALID_ORIGIN");
  }

  const originValue = request.headers.get("origin");
  if (!originValue) {
    throw new AuthenticationError("Origin header is required.", 403, "INVALID_ORIGIN");
  }

  let origin: URL;
  try {
    origin = new URL(originValue);
  } catch {
    throw new AuthenticationError("Invalid request origin.", 403, "INVALID_ORIGIN");
  }

  const configuredOrigin = process.env.APP_URL;
  if (configuredOrigin) {
    let expected: URL;
    try {
      expected = new URL(configuredOrigin);
    } catch {
      throw new Error("APP_URL must be an absolute URL.");
    }
    if (origin.origin !== expected.origin) {
      throw new AuthenticationError("Request origin does not match APP_URL.", 403, "INVALID_ORIGIN");
    }
    return;
  }

  const host = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim() || request.headers.get("host");
  const protocol =
    request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() || new URL(request.url).protocol.slice(0, -1);
  if (!host || origin.host !== host || origin.protocol !== `${protocol}:`) {
    throw new AuthenticationError("Request origin does not match host.", 403, "INVALID_ORIGIN");
  }
}

async function readSessionToken(): Promise<string | null> {
  return (await cookies()).get(sessionCookieName())?.value ?? null;
}

export async function getCurrentSession(): Promise<AuthenticatedSession | null> {
  const token = await readSessionToken();
  if (!token || token.length > 128) return null;

  const now = new Date();
  const rows = await db
    .select({
      sessionId: authSessions.id,
      userId: users.id,
      membershipId: memberships.id,
      workspaceId: workspaces.id,
      workspaceSlug: workspaces.slug,
      workspaceName: workspaces.name,
      email: users.email,
      displayName: users.displayName,
      role: memberships.role,
      expiresAt: authSessions.expiresAt,
      lastSeenAt: authSessions.lastSeenAt,
    })
    .from(authSessions)
    .innerJoin(users, eq(users.id, authSessions.userId))
    .innerJoin(memberships, eq(memberships.id, authSessions.membershipId))
    .innerJoin(workspaces, eq(workspaces.id, authSessions.workspaceId))
    .where(
      and(
        eq(authSessions.tokenHash, hashSessionToken(token)),
        isNull(authSessions.revokedAt),
        gt(authSessions.expiresAt, now),
        eq(users.isActive, true),
        eq(memberships.status, "active"),
        eq(workspaces.status, "active"),
      ),
    )
    .limit(1);

  const row = rows[0];
  if (!row) return null;

  if (now.getTime() - row.lastSeenAt.getTime() > 15 * 60 * 1_000) {
    await db
      .update(authSessions)
      .set({ lastSeenAt: now })
      .where(and(eq(authSessions.id, row.sessionId), isNull(authSessions.revokedAt)));
  }

  return {
    sessionId: row.sessionId,
    userId: row.userId,
    membershipId: row.membershipId,
    workspaceId: row.workspaceId,
    workspaceSlug: row.workspaceSlug,
    workspaceName: row.workspaceName,
    email: row.email,
    displayName: row.displayName,
    role: row.role,
    expiresAt: row.expiresAt,
  };
}

export async function requireSession(): Promise<AuthenticatedSession> {
  const session = await getCurrentSession();
  if (!session) throw new AuthenticationError();
  return session;
}

async function assertLoginAllowed(keyHash: string): Promise<void> {
  const row = await db.query.authLoginAttempts.findFirst({
    where: eq(authLoginAttempts.keyHash, keyHash),
  });
  if (!row?.blockedUntil) return;
  const remaining = row.blockedUntil.getTime() - Date.now();
  if (remaining > 0) throw new LoginRateLimitError(Math.ceil(remaining / 1_000));
}

async function recordLoginFailure(keyHash: string): Promise<void> {
  const now = new Date();
  await db.transaction(async (tx) => {
    const row = await tx.query.authLoginAttempts.findFirst({
      where: eq(authLoginAttempts.keyHash, keyHash),
    });
    const inWindow = row && now.getTime() - row.firstFailureAt.getTime() <= LOGIN_WINDOW_MS;
    const failureCount = inWindow ? row.failureCount + 1 : 1;
    const blockedUntil = failureCount >= LOGIN_MAX_FAILURES ? new Date(now.getTime() + LOGIN_BLOCK_MS) : null;

    await tx
      .insert(authLoginAttempts)
      .values({
        keyHash,
        failureCount,
        firstFailureAt: inWindow ? row.firstFailureAt : now,
        blockedUntil,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: authLoginAttempts.keyHash,
        set: {
          failureCount,
          firstFailureAt: inWindow ? row.firstFailureAt : now,
          blockedUntil,
          updatedAt: now,
        },
      });
  });
}

async function performDummyPasswordWork(password: string): Promise<void> {
  const padded = `${password}${"x".repeat(12)}`.slice(0, 256);
  await hashPassword(padded);
}

export async function authenticateUser(
  emailInput: string,
  password: string,
  clientAddress: string,
): Promise<LoginIdentity | null> {
  const email = normalizeEmail(emailInput);
  const keyHash = hashLoginAttemptKey(email, clientAddress);
  await assertLoginAllowed(keyHash);

  const configuredWorkspace = process.env.AUTH_WORKSPACE_SLUG?.trim().toLowerCase();
  const conditions = [
    eq(users.email, email),
    eq(users.isActive, true),
    eq(memberships.status, "active"),
    eq(workspaces.status, "active"),
  ];
  if (configuredWorkspace) conditions.push(eq(workspaces.slug, configuredWorkspace));

  const rows = await db
    .select({
      userId: users.id,
      passwordHash: users.passwordHash,
      membershipId: memberships.id,
      workspaceId: workspaces.id,
      workspaceSlug: workspaces.slug,
      workspaceName: workspaces.name,
      email: users.email,
      displayName: users.displayName,
      role: memberships.role,
    })
    .from(users)
    .innerJoin(memberships, eq(memberships.userId, users.id))
    .innerJoin(workspaces, eq(workspaces.id, memberships.workspaceId))
    .where(and(...conditions))
    .limit(2);

  const row = rows.length === 1 ? rows[0] : null;
  const passwordMatches = row
    ? await verifyPassword(row.passwordHash, password)
    : (await performDummyPasswordWork(password), false);

  if (!row || !passwordMatches) {
    await recordLoginFailure(keyHash);
    return null;
  }

  await db.transaction(async (tx) => {
    await tx.delete(authLoginAttempts).where(eq(authLoginAttempts.keyHash, keyHash));
    await tx.update(users).set({ lastLoginAt: new Date(), updatedAt: new Date() }).where(eq(users.id, row.userId));
  });

  return {
    userId: row.userId,
    membershipId: row.membershipId,
    workspaceId: row.workspaceId,
    workspaceSlug: row.workspaceSlug,
    workspaceName: row.workspaceName,
    email: row.email,
    displayName: row.displayName,
    role: row.role,
  };
}

export async function createUserSession(
  identity: LoginIdentity,
  request: NextRequest,
  response: NextResponse,
): Promise<AuthenticatedSession> {
  const token = createSessionToken();
  const expiresAt = new Date(Date.now() + configuredSessionLifetimeMs());
  const userAgent = request.headers.get("user-agent")?.slice(0, 512) || null;
  const clientAddress = getClientAddress(request);
  const safeAddress = clientAddress === "unknown" ? null : clientAddress;

  const [created] = await db
    .insert(authSessions)
    .values({
      workspaceId: identity.workspaceId,
      userId: identity.userId,
      membershipId: identity.membershipId,
      tokenHash: hashSessionToken(token),
      expiresAt,
      createdIp: safeAddress,
      userAgent,
    })
    .returning({ id: authSessions.id });

  response.cookies.set(sessionCookieName(), token, cookieOptions(expiresAt));
  return { ...identity, sessionId: created.id, expiresAt };
}

export async function revokeCurrentSession(response?: NextResponse): Promise<void> {
  const token = await readSessionToken();
  if (token) {
    await db
      .update(authSessions)
      .set({ revokedAt: new Date() })
      .where(and(eq(authSessions.tokenHash, hashSessionToken(token)), isNull(authSessions.revokedAt)));
  }

  const expires = new Date(0);
  if (response) response.cookies.set(sessionCookieName(), "", { ...cookieOptions(expires), maxAge: 0 });
  else (await cookies()).set(sessionCookieName(), "", { ...cookieOptions(expires), maxAge: 0 });
}

export async function deleteExpiredSessions(before = new Date()): Promise<number> {
  const deleted = await db.delete(authSessions).where(lt(authSessions.expiresAt, before)).returning({ id: authSessions.id });
  return deleted.length;
}
