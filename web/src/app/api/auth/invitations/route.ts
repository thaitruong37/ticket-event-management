import { and, eq, isNull } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

import { db } from "../../../../db";
import { createSessionToken, hashSessionToken, normalizeEmail } from "../../../../db/crypto";
import { auditLogs, invitations } from "../../../../db/schema";
import { AuthenticationError, assertSameOrigin, readBoundedRequestText } from "../../../../server/auth";
import { AuthorizationError, requireRole } from "../../../../server/authorization";

export const runtime = "nodejs";

const INVITABLE_ROLES = ["operations", "finance", "viewer"] as const;
type InvitableRole = (typeof INVITABLE_ROLES)[number];

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    assertSameOrigin(request);
    const session = await requireRole("owner");
    const body = JSON.parse(await readBoundedRequestText(request, 8_192)) as Record<string, unknown>;
    const email = normalizeEmail(typeof body.email === "string" ? body.email : "");
    const role = body.role as InvitableRole;
    const hours = typeof body.expiresInHours === "number" ? body.expiresInHours : 72;
    if (!email || email.length > 320 || !email.includes("@") || !INVITABLE_ROLES.includes(role)) {
      return NextResponse.json({ error: "INVALID_INVITATION" }, { status: 400 });
    }
    if (!Number.isInteger(hours) || hours < 1 || hours > 168) {
      return NextResponse.json({ error: "INVALID_EXPIRATION" }, { status: 400 });
    }

    const token = createSessionToken();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + hours * 60 * 60 * 1_000);
    const [created] = await db.transaction(async (tx) => {
      await tx
        .update(invitations)
        .set({ revokedAt: now })
        .where(
          and(
            eq(invitations.workspaceId, session.workspaceId),
            eq(invitations.email, email),
            isNull(invitations.usedAt),
            isNull(invitations.revokedAt),
          ),
        );
      const inserted = await tx
        .insert(invitations)
        .values({
          workspaceId: session.workspaceId,
          email,
          role,
          tokenHash: hashSessionToken(token),
          invitedByMembershipId: session.membershipId,
          expiresAt,
        })
        .returning({ id: invitations.id });
      await tx.insert(auditLogs).values({
        workspaceId: session.workspaceId,
        actorMembershipId: session.membershipId,
        action: "invitation.created",
        entityType: "invitation",
        entityId: inserted[0].id,
        metadata: { email, role, expiresAt: expiresAt.toISOString() },
      });
      return inserted;
    });

    const baseUrl = process.env.APP_URL ? new URL(process.env.APP_URL) : request.nextUrl;
    const acceptUrl = new URL("/login/invite", baseUrl);
    acceptUrl.searchParams.set("token", token);
    return NextResponse.json(
      { id: created.id, email, role, expiresAt: expiresAt.toISOString(), acceptUrl: acceptUrl.toString() },
      { status: 201, headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    if (error instanceof AuthenticationError || error instanceof AuthorizationError) {
      return NextResponse.json({ error: error.code }, { status: error.status });
    }
    return NextResponse.json({ error: "INVITATION_CREATE_FAILED" }, { status: 400 });
  }
}
