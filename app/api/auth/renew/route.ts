import NextAuth from "next-auth";
import { NextResponse, type NextRequest } from "next/server";
import { authOptions } from "@/lib/auth";
import { safeCallbackPath } from "@/lib/safe-callback";

/**
 * Renews the SSO access token during a page navigation, then sends the user
 * back to the page they asked for.
 *
 * The proxy redirects here when the access token is (nearly) expired. Running
 * NextAuth's own `session` action re-runs the jwt callback (refresh) and
 * returns the new session cookie; this handler copies those Set-Cookie headers
 * onto a redirect. It is the only way, next to the client's /api/auth/session
 * polling, to persist a refresh: the SSO rotates refresh tokens on every use,
 * so a refresh that is not stored would break the session.
 *
 * Lives under /api/auth so it stays reachable without a valid session.
 */
const nextAuthHandler = NextAuth(authOptions);

export async function GET(request: NextRequest) {
  const callback = safeCallbackPath(request.nextUrl.searchParams.get("callbackUrl"));
  const base = process.env.NEXTAUTH_URL ?? request.url;

  const sessionResponse = (await nextAuthHandler(request, {
    params: Promise.resolve({ nextauth: ["session"] }),
  })) as Response;

  const redirect = NextResponse.redirect(new URL(callback, base));
  // One-shot guard so a degenerate refresh result cannot cause a redirect loop.
  // Set it first: NextResponse.cookies rewrites the whole Set-Cookie header,
  // which would drop session cookies appended before it.
  redirect.cookies.set("tl-renewed", "1", {
    path: "/",
    maxAge: 10,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NEXTAUTH_URL?.startsWith("https://") ?? false,
  });
  for (const cookie of sessionResponse.headers.getSetCookie()) {
    redirect.headers.append("Set-Cookie", cookie);
  }
  redirect.headers.set("Cache-Control", "no-store");
  return redirect;
}
