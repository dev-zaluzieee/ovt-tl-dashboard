import { NextResponse, type NextRequest } from "next/server";
import { demaxiaIssuer } from "@/lib/auth";

/**
 * Full sign-out: clears the NextAuth cookies of this app, then redirects
 * through the SSO `/end_session` so the central SSO session ends too. Also the
 * landing point when a token refresh failed. Lives under /api/auth so it stays
 * reachable without a valid session.
 */
export async function GET(request: NextRequest) {
  const issuer = demaxiaIssuer();
  const clientId = process.env.DEMAXIA_CLIENT_ID;
  // No trailing slash: it must equal the post-logout URL registered in the SSO.
  const appUrl = process.env.NEXTAUTH_URL?.trim().replace(/\/+$/, "");

  if (!issuer || !clientId || !appUrl) {
    console.error("[sso-logout] missing DEMAXIA_ISSUER, DEMAXIA_CLIENT_ID or NEXTAUTH_URL");
    return NextResponse.json({ error: "Logout misconfigured" }, { status: 500 });
  }

  const params = new URLSearchParams({
    post_logout_redirect_uri: appUrl,
    client_id: clientId,
  });
  const response = NextResponse.redirect(`${issuer}/end_session?${params.toString()}`);

  // __Secure-/__Host- cookies can only be deleted by a Set-Cookie that also
  // carries Secure, so expire them explicitly instead of using cookies.delete.
  // The session token may be chunked (".0", ".1", ...), so every request cookie
  // whose name starts with the session-token name is expired, with or without prefix.
  const names = new Set<string>([
    "next-auth.session-token",
    "__Secure-next-auth.session-token",
    "next-auth.csrf-token",
    "__Host-next-auth.csrf-token",
    "next-auth.callback-url",
    "__Secure-next-auth.callback-url",
    "tl-renewed",
  ]);
  for (const { name } of request.cookies.getAll()) {
    const bare = name.replace(/^(?:__Secure-|__Host-)/, "");
    if (bare.startsWith("next-auth.session-token")) names.add(name);
  }
  for (const name of names) {
    const prefixed = name.startsWith("__Secure-") || name.startsWith("__Host-");
    response.cookies.set(name, "", {
      path: "/",
      expires: new Date(0),
      secure: prefixed,
      httpOnly: true,
      sameSite: "lax",
    });
  }

  // Never let a shared cache or the service worker keep this redirect.
  response.headers.set("Cache-Control", "no-store");
  return response;
}
