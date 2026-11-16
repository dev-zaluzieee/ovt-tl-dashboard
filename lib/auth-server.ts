/**
 * Server-side view of the signed-in user (server components, route handlers).
 *
 * Reads the encrypted NextAuth JWT cookie WITHOUT running the jwt callback:
 * the SSO rotates refresh tokens on every use, so a refresh whose new tokens
 * cannot be persisted would invalidate the user's session. Refreshing happens
 * only where cookies can be written: /api/auth/session (client polling) and
 * /api/auth/renew (page navigations, see proxy.ts).
 */

import { cookies, headers } from "next/headers";
import { getToken } from "next-auth/jwt";
import type { DemaxiaJWT } from "./auth";

/** Decoded NextAuth JWT of the current request, or null when signed out. */
export async function getSessionToken(): Promise<DemaxiaJWT | null> {
  // Not inside the try: Next signals "this render is dynamic" by throwing from
  // cookies()/headers(), and that must reach the framework.
  const [cookieStore, headerStore] = await Promise.all([cookies(), headers()]);
  try {
    const token = await getToken({
      // getToken only needs the cookies and headers of the request.
      req: {
        cookies: Object.fromEntries(cookieStore.getAll().map((c) => [c.name, c.value])),
        headers: Object.fromEntries(headerStore),
      } as never,
      secret: process.env.NEXTAUTH_SECRET,
    });
    return (token as DemaxiaJWT | null) ?? null;
  } catch (error) {
    // Undecryptable cookie (rotated secret, tampering): treat as signed out.
    console.error("Error reading session token:", error);
    return null;
  }
}

export interface ServerSession {
  user: {
    email: string | null;
    /** SSO display name. */
    name: string | null;
  };
}

/**
 * Signed-in user, or null when there is no usable session (no cookie, refresh
 * failed). An access token that merely expired is still "signed in": the
 * proxy renews it before pages render.
 */
export async function getServerSession(): Promise<ServerSession | null> {
  const token = await getSessionToken();
  if (!token || token.error || !token.email) return null;
  return {
    user: {
      email: typeof token.email === "string" ? token.email : null,
      name: typeof token.name === "string" ? token.name : null,
    },
  };
}
