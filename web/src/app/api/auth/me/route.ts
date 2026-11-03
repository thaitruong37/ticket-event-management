import { NextResponse } from "next/server";

import { getCurrentSession } from "../../../../server/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  const session = await getCurrentSession();
  if (!session) {
    return NextResponse.json({ authenticated: false }, { status: 401, headers: { "cache-control": "no-store" } });
  }

  return NextResponse.json(
    {
      authenticated: true,
      user: {
        id: session.userId,
        email: session.email,
        displayName: session.displayName,
      },
      membership: {
        id: session.membershipId,
        role: session.role,
      },
      workspace: {
        id: session.workspaceId,
        slug: session.workspaceSlug,
        name: session.workspaceName,
      },
      expiresAt: session.expiresAt.toISOString(),
    },
    { headers: { "cache-control": "no-store" } },
  );
}
