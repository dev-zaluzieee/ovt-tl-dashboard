/**
 * fetch for calls to the BFF (/api/**) with one shared 401 recovery.
 *
 * A 401 usually means the SSO access token expired between two session polls
 * (laptop woke up from sleep). `getSession()` hits /api/auth/session, which
 * renews the token and stores the new cookie; then the request is retried
 * ONCE. If it is still 401 the session is really gone: tell the user in Czech
 * and go to the login page (the address with its filters comes back after the sign-in).
 *
 * Only for bodies that can be sent twice (string, FormData, Blob, none).
 */

import { getSession } from "next-auth/react";

export const SESSION_EXPIRED_MESSAGE = "Přihlášení vypršelo, přihlaste se prosím znovu.";

let redirecting = false;

function goToLogin(): void {
  if (typeof window === "undefined" || redirecting) return;
  redirecting = true;
  window.alert(SESSION_EXPIRED_MESSAGE);
  const here = `${window.location.pathname}${window.location.search}`;
  // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- full navigation, the SSO login must start clean
  window.location.assign(`/login?callbackUrl=${encodeURIComponent(here)}`);
}

export const SERVICE_UNAVAILABLE_MESSAGE = "Server je dočasně nedostupný, zkuste to prosím za chvíli.";

/**
 * 503 = the backend, SSO or ERP is temporarily unavailable. It is NOT a lost
 * session: no retry, no redirect, the user stays on the page with the draft.
 * Make sure callers find a Czech `message` in the JSON body.
 */
async function withServiceMessage(res: Response): Promise<Response> {
  const json = (await res.clone().json().catch(() => null)) as Record<string, unknown> | null;
  if (json && typeof json.message === "string" && json.message) return res;
  const body = { ...(json ?? {}), success: false, error: SERVICE_UNAVAILABLE_MESSAGE, message: SERVICE_UNAVAILABLE_MESSAGE };
  return new Response(JSON.stringify(body), { status: 503, headers: { "Content-Type": "application/json" } });
}

export async function bffFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const first = await fetch(input, init);
  if (first.status === 503) return withServiceMessage(first);
  if (first.status !== 401) return first;

  try {
    await getSession();
  } catch {
    // network trouble: the retry below decides
  }
  const second = await fetch(input, init);
  if (second.status === 401) {
    // The sign-in itself is fine but the ERP refused the forwarded token (e.g. the app is not allowed there): a new
    // sign-in would loop forever, so say it plainly and stay (the caller shows the `TOKEN_RENEW` message).
    const body = (await second.clone().json().catch(() => null)) as { code?: unknown } | null;
    if (body?.code === 'TOKEN_RENEW') return second;
    goToLogin();
  }
  if (second.status === 503) return withServiceMessage(second);
  return second;
}
