import { and, eq, gt, isNull } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

import { db } from "../../../../db";
import { hashPassword, hashSessionToken, normalizeEmail } from "../../../../db/crypto";
import { auditLogs, invitations, memberships, users, workspaces } from "../../../../db/schema";
import {
  AuthenticationError,
  assertSameOrigin,
  createUserSession,
  readBoundedRequestText,
  type LoginIdentity,
} from "../../../../server/auth";

export const runtime = "nodejs";

async function payload(request: NextRequest): Promise<Record<string, string>> {
  const text = await readBoundedRequestText(request, 16_384);
  if (request.headers.get("content-type")?.includes("application/json")) {
    const body = JSON.parse(text) as Record<string, unknown>;
    return Object.fromEntries(Object.entries(body).map(([key, value]) => [key, typeof value === "string" ? value : ""]));
  }
  return Object.fromEntries(new URLSearchParams(text).entries());
}

function isJson(request: NextRequest): boolean {
  return request.headers.get("content-type")?.includes("application/json") ?? false;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    assertSameOrigin(request);
    const body = await payload(request);
    const token = body.token?.trim();
    const displayName = body.displayName?.trim();
    const password = body.password ?? "";
    if (!token || token.length > 128 || !displayName || displayName.length > 160) {
      return NextResponse.json({ error: "INVALID_INVITATION" }, { status: 400 });
    }

    const passwordHash = await hashPassword(password);
    const now = new Date();
    const identity = await db.transaction(async (tx): Promise<LoginIdentity> => {
      const [claimed] = await tx
        .update(invitations)
        .set({ usedAt: now })
        .where(
          and(
            eq(invitations.tokenHash, hashSessionToken(token)),
            isNull(invitations.usedAt),
            isNull(invitations.revokedAt),
            gt(invitations.expiresAt, now),
          ),
        )
        .returning({
          workspaceId: invitations.workspaceId,
          email: invitations.email,
          role: invitations.role,
        });
      if (!claimed) throw new AuthenticationError("Invitation is invalid or expired.", 400, "INVALID_INVITATION");

      const existing = await tx.select({ id: users.id }).from(users).where(eq(users.email, normalizeEmail(claimed.email))).limit(1);
      if (existing.length) {
        throw new AuthenticationError("Invitation cannot be accepted for this account.", 409, "ACCOUNT_EXISTS");
      }

      const [user] = await tx
        .insert(users)
        .values({ email: normalizeEmail(claimed.email), displayName, passwordHash })
        .returning({ id: users.id, email: users.email, displayName: users.displayName });
      const [membership] = await tx
        .insert(memberships)
        .values({ workspaceId: claimed.workspaceId, userId: user.id, role: claimed.role })
        .returning({ id: memberships.id, role: memberships.role });
      const [workspace] = await tx
        .select({ id: workspaces.id, slug: workspaces.slug, name: workspaces.name })
        .from(workspaces)
        .where(eq(workspaces.id, claimed.workspaceId))
        .limit(1);
      if (!workspace) throw new Error("Invitation workspace does not exist.");
      await tx.insert(auditLogs).values({
        workspaceId: workspace.id,
        actorMembershipId: membership.id,
        action: "invitation.accepted",
        entityType: "membership",
        entityId: membership.id,
        metadata: { invitationEmail: claimed.email },
      });

      return {
        userId: user.id,
        membershipId: membership.id,
        workspaceId: workspace.id,
        workspaceSlug: workspace.slug,
        workspaceName: workspace.name,
        email: user.email,
        displayName: user.displayName,
        role: membership.role,
      };
    });

    const response = isJson(request)
      ? NextResponse.json({ user: identity }, { status: 201 })
      : NextResponse.redirect(new URL("/", request.url), 303);
    await createUserSession(identity, request, response);
    response.headers.set("cache-control", "no-store");
    return response;
  } catch (error) {
    const status = error instanceof AuthenticationError ? error.status : 400;
    const code = error instanceof AuthenticationError ? error.code : "INVITATION_ACCEPT_FAILED";
    if (isJson(request)) return NextResponse.json({ error: code }, { status });
    return NextResponse.redirect(new URL(`/login/invite?error=${encodeURIComponent(code)}`, request.url), 303);
  }
}
