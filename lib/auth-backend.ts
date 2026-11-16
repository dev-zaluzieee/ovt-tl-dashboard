/**
 * Bearer for the backend (BACKEND_API_URL).
 *
 * The backend (module tl2) verifies the team leader's own SSO access token (audience = the dashboard's SSO app) and
 * forwards it to the ERP on writes, so every server route sends the token from the NextAuth session as-is. Nothing is
 * signed here. The token never reaches the browser.
 */

import { getSessionToken } from './auth-server';

/**
 * SSO access token of the signed-in user, or null when signed out, the refresh failed or the token has already
 * expired (the client then renews the session through /api/auth/session and retries).
 */
export async function getBackendBearer(): Promise<string | null> {
  const token = await getSessionToken();
  if (!token || token.error || !token.access_token) return null;
  if (token.expires_at && Date.now() >= token.expires_at) return null;
  return token.access_token;
}
