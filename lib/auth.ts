/**
 * Demaxia SSO (OIDC) via NextAuth: PKCE, token refresh in the jwt callback,
 * Secure cookies behind a TLS-terminating proxy.
 *
 * The SSO access token lives ONLY in the encrypted NextAuth JWT cookie. The
 * browser session exposes just the display name, e-mail and `error`; the
 * token is read server-side by `lib/auth-backend.ts` and sent to the backend
 * as the bearer. Who may sign in is decided in the SSO admin.
 */

import type { NextAuthOptions, Profile } from "next-auth";
import type { JWT } from "next-auth/jwt";

interface DemaxiaProfile extends Profile {
  sub: string;
  email: string;
  name: string;
  picture?: string;
}

export interface DemaxiaTokenState {
  access_token?: string;
  id_token?: string;
  refresh_token?: string;
  /** Epoch ms. */
  expires_at?: number;
  error?: "refresh_failed" | "no_refresh_token";
}

export type DemaxiaJWT = JWT & DemaxiaTokenState;

/** Issuer URL without a trailing slash (endpoints are built as `${issuer}/token` etc.). */
export function demaxiaIssuer(): string {
  return (process.env.DEMAXIA_ISSUER ?? "").trim().replace(/\/+$/, "");
}

/**
 * Refresh this long before the access token expires. Must be clearly longer
 * than the client's session poll (60 s, AuthProviders): with a shorter value a
 * poll can miss the window and API calls are refused until the next poll
 * (seen 2026-11-15: a save 14 s after expiry). 150 s covers two polls.
 */
export const REFRESH_LEEWAY_MS = 150_000;

/** OAuth error codes that mean the refresh token is dead (not a transient failure). */
function isTerminalRefreshError(status: number, body: unknown): boolean {
  if (status !== 400 && status !== 401) return false;
  const code =
    body && typeof body === "object" && typeof (body as { error?: unknown }).error === "string"
      ? (body as { error: string }).error
      : null;
  // invalid_grant (expired, reused, session revoked) or any explicit OAuth error.
  return code !== null;
}

async function callTokenEndpoint(token: DemaxiaJWT): Promise<DemaxiaJWT> {
  try {
    const basic = Buffer.from(
      `${process.env.DEMAXIA_CLIENT_ID}:${process.env.DEMAXIA_CLIENT_SECRET}`
    ).toString("base64");

    const res = await fetch(`${demaxiaIssuer()}/token`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${basic}`,
      },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: token.refresh_token as string,
      }).toString(),
      signal: AbortSignal.timeout(8_000),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => null);
      if (isTerminalRefreshError(res.status, body)) return { ...token, error: "refresh_failed" };
      // 5xx, 429, odd answers: transient. Keep the token state and retry on the next call.
      return token;
    }

    const data = (await res.json()) as {
      access_token: string;
      id_token: string;
      refresh_token?: string;
      expires_in: number;
    };

    return {
      ...token,
      access_token: data.access_token,
      id_token: data.id_token,
      // The SSO rotates refresh tokens on every use.
      refresh_token: data.refresh_token ?? token.refresh_token,
      expires_at: Date.now() + data.expires_in * 1000,
      error: undefined,
    };
  } catch {
    // Network error or timeout: transient, never ends the session.
    return token;
  }
}

// Single-flight per refresh token. The SSO rotates refresh tokens and treats
// re-use of an old one as theft, so two simultaneous refreshes (session poll
// plus a page renew) must share ONE call. A successful result is kept for a
// few seconds: a caller that still holds the old cookie gets the winner's
// tokens instead of failing.
const inflight = new Map<string, Promise<DemaxiaJWT>>();
const recent = new Map<string, { at: number; token: DemaxiaJWT }>();
const RECENT_TTL_MS = 10_000;

async function refresh(token: DemaxiaJWT): Promise<DemaxiaJWT> {
  const key = token.refresh_token;
  if (!key) return { ...token, error: "no_refresh_token" };

  const now = Date.now();
  for (const [k, v] of recent) if (now - v.at > RECENT_TTL_MS) recent.delete(k);

  const done = recent.get(key);
  if (done) return { ...token, ...done.token, error: undefined };

  const pending = inflight.get(key);
  if (pending) return pending;

  const p = callTokenEndpoint(token)
    .then((result) => {
      if (!result.error && result.refresh_token !== key) {
        recent.set(key, { at: Date.now(), token: result });
      }
      return result;
    })
    .finally(() => inflight.delete(key));
  inflight.set(key, p);
  return p;
}

// Reverse-proxy hosts terminate TLS before the app, so Next.js sees plain
// HTTP. Derive Secure cookies from NEXTAUTH_URL, otherwise the pkce/state
// cookies are lost by the callback (OAUTH_CALLBACK_ERROR).
const useSecureCookies = process.env.NEXTAUTH_URL?.startsWith("https://") ?? false;
const cookiePrefix = useSecureCookies ? "__Secure-" : "";

export const authOptions: NextAuthOptions = {
  secret: process.env.NEXTAUTH_SECRET,
  useSecureCookies,
  cookies: {
    sessionToken: {
      name: `${cookiePrefix}next-auth.session-token`,
      options: { httpOnly: true, sameSite: "lax", path: "/", secure: useSecureCookies },
    },
    callbackUrl: {
      name: `${cookiePrefix}next-auth.callback-url`,
      options: { sameSite: "lax", path: "/", secure: useSecureCookies },
    },
    csrfToken: {
      name: `${useSecureCookies ? "__Host-" : ""}next-auth.csrf-token`,
      options: { httpOnly: true, sameSite: "lax", path: "/", secure: useSecureCookies },
    },
    pkceCodeVerifier: {
      name: `${cookiePrefix}next-auth.pkce.code_verifier`,
      options: { httpOnly: true, sameSite: "lax", path: "/", secure: useSecureCookies, maxAge: 900 },
    },
    state: {
      name: `${cookiePrefix}next-auth.state`,
      options: { httpOnly: true, sameSite: "lax", path: "/", secure: useSecureCookies, maxAge: 900 },
    },
    nonce: {
      name: `${cookiePrefix}next-auth.nonce`,
      options: { httpOnly: true, sameSite: "lax", path: "/", secure: useSecureCookies },
    },
  },
  providers: [
    {
      id: "demaxia",
      name: "Demaxia SSO",
      type: "oauth",
      wellKnown: `${demaxiaIssuer()}/.well-known/openid-configuration`,
      clientId: process.env.DEMAXIA_CLIENT_ID,
      clientSecret: process.env.DEMAXIA_CLIENT_SECRET,
      authorization: { params: { scope: "openid profile email" } },
      idToken: true,
      checks: ["pkce", "state", "nonce"],
      profile(p: DemaxiaProfile) {
        return {
          id: p.sub,
          email: p.email,
          name: p.name,
          image: p.picture ?? null,
        };
      },
    },
  ],
  session: { strategy: "jwt" },
  // Sign-in and auth errors both land on our page (it starts the SSO flow).
  pages: { signIn: "/login", error: "/login" },
  callbacks: {
    async jwt({ token, account }) {
      const t = token as DemaxiaJWT;

      if (account) {
        t.access_token = account.access_token;
        t.id_token = account.id_token;
        t.refresh_token = account.refresh_token;
        t.expires_at = account.expires_at
          ? account.expires_at * 1000
          : Date.now() + 30 * 60 * 1000;
      }

      if (t.expires_at && Date.now() < t.expires_at - REFRESH_LEEWAY_MS) return t;
      return refresh(t);
    },
    async session({ session, token }) {
      // Only what the UI needs. The access token is never copied here: this
      // object is serialised to the browser by /api/auth/session.
      const t = token as DemaxiaJWT;
      return {
        ...session,
        error: t.error,
        user: {
          name: session.user?.name ?? null,
          email: session.user?.email ?? null,
        },
      };
    },
  },
};
