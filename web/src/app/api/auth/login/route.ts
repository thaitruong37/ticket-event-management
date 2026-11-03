import { NextRequest, NextResponse } from "next/server";

import {
  AuthenticationError,
  LoginRateLimitError,
  assertSameOrigin,
  authenticateUser,
  createUserSession,
  getClientAddress,
  readBoundedRequestText,
} from "../../../../server/auth";

export const runtime = "nodejs";

const MAX_BODY_BYTES = 8 * 1_024;

function wantsJson(request: NextRequest): boolean {
  return request.headers.get("content-type")?.includes("application/json") ?? false;
}

function safeRedirectPath(value: unknown): string {
  return typeof value === "string" && value.startsWith("/") && !value.startsWith("//") ? value : "/";
}

async function readCredentials(request: NextRequest): Promise<{ email: string; password: string; next: string }> {
  const text = await readBoundedRequestText(request, MAX_BODY_BYTES);
  if (wantsJson(request)) {
    const body = JSON.parse(text) as Record<string, unknown>;
    return {
      email: typeof body.email === "string" ? body.email : "",
      password: typeof body.password === "string" ? body.password : "",
      next: safeRedirectPath(body.next),
    };
  }

  const form = new URLSearchParams(text);
  return {
    email: form.get("email") ?? "",
    password: form.get("password") ?? "",
    next: safeRedirectPath(form.get("next")),
  };
}

function errorResponse(request: NextRequest, error: unknown): NextResponse {
  const status = error instanceof AuthenticationError ? error.status : 400;
  const code = error instanceof AuthenticationError ? error.code : "INVALID_REQUEST";
  if (wantsJson(request)) {
    const response = NextResponse.json({ error: code, message: "Unable to sign in." }, { status });
    if (error instanceof LoginRateLimitError) response.headers.set("retry-after", String(error.retryAfterSeconds));
    return response;
  }

  const reason = error instanceof LoginRateLimitError ? "rate_limited" : "invalid";
  return NextResponse.redirect(new URL(`/login?error=${reason}`, request.url), 303);
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    assertSameOrigin(request);
    const { email, password, next } = await readCredentials(request);
    if (!email || email.length > 320 || !password || password.length > 256) {
      return errorResponse(request, new AuthenticationError("Invalid credentials.", 401, "INVALID_CREDENTIALS"));
    }

    const identity = await authenticateUser(email, password, getClientAddress(request));
    if (!identity) {
      return errorResponse(request, new AuthenticationError("Invalid credentials.", 401, "INVALID_CREDENTIALS"));
    }

    const response = wantsJson(request)
      ? NextResponse.json({ user: identity }, { status: 200 })
      : NextResponse.redirect(new URL(next, request.url), 303);
    await createUserSession(identity, request, response);
    response.headers.set("cache-control", "no-store");
    return response;
  } catch (error) {
    return errorResponse(request, error);
  }
}
