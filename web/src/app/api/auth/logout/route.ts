import { NextRequest, NextResponse } from "next/server";

import { AuthenticationError, assertSameOrigin, revokeCurrentSession } from "../../../../server/auth";

export const runtime = "nodejs";

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    assertSameOrigin(request);
    const acceptsJson = request.headers.get("accept")?.includes("application/json") ?? false;
    const response = acceptsJson
      ? NextResponse.json({ ok: true })
      : NextResponse.redirect(new URL("/login", request.url), 303);
    await revokeCurrentSession(response);
    response.headers.set("cache-control", "no-store");
    return response;
  } catch (error) {
    const status = error instanceof AuthenticationError ? error.status : 400;
    return NextResponse.json({ error: "LOGOUT_FAILED" }, { status });
  }
}
