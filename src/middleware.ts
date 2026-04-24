import { NextResponse, type NextRequest } from "next/server";

/**
 * Basic CSRF hardening for a local-only dev tool.
 *
 * For state-changing requests to /api/*, require the Origin header to match
 * the server's host. Modern browsers send Origin on all non-GET requests,
 * so a missing or mismatched Origin indicates a cross-site attempt.
 *
 * This does NOT replace real auth. It only prevents a malicious page in
 * the same browser from silently posting to the local API.
 */

const MUTATING = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export function middleware(req: NextRequest) {
  if (!MUTATING.has(req.method)) return NextResponse.next();

  const origin = req.headers.get("origin");
  if (!origin) {
    return NextResponse.json(
      { error: "missing Origin header" },
      { status: 403 },
    );
  }

  let originHost: string;
  try {
    originHost = new URL(origin).host;
  } catch {
    return NextResponse.json({ error: "invalid Origin" }, { status: 403 });
  }

  const expectedHost = req.headers.get("host") ?? req.nextUrl.host;
  if (originHost !== expectedHost) {
    return NextResponse.json(
      { error: "cross-origin request blocked" },
      { status: 403 },
    );
  }

  return NextResponse.next();
}

export const config = {
  matcher: "/api/:path*",
};
