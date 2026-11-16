/**
 * Access check of the recordings routes (`/api/calls/*`). The recordings service is called with one shared service
 * account, so the dashboard's own session is the only protection: EVERY route here first requires a signed-in team leader
 * AND a successful answer of the backend (`GET /api/tl2/meta`: token valid, caller has an active ERP user) before the
 * recordings service is touched. A positive answer is remembered for 60 s per token (the cache holds no token, only a
 * hash-free short fingerprint: the last 16 characters of the signature).
 */

import { NextResponse, type NextRequest } from 'next/server';
import { getBackendBearer } from '@/lib/auth-backend';
import { BackendConfigError, getBackendUrl } from '@/lib/backend-url';
import { checkCsrf } from '@/lib/csrf';
import { getServerSession } from '@/lib/auth-server';
import { checkCallGrant } from '@/lib/call-grant';

const OK_TTL_MS = 60_000;
const okUntil = new Map<string, number>();

function fail(status: number, message: string, code: string): NextResponse {
  return NextResponse.json({ success: false, message, code }, { status, headers: { 'Cache-Control': 'no-store' } });
}

/** Calls the backend with the caller's bearer; JSON in, JSON out (`null` body on network failure is reported as 503). */
export async function backendJson(token: string, method: 'GET' | 'POST', path: string, body?: unknown, query?: Record<string, string>): Promise<{ status: number; json: Record<string, unknown> }> {
  const url = new URL(`/api/tl2/${path}`, getBackendUrl());
  for (const [k, v] of Object.entries(query ?? {})) url.searchParams.set(k, v);
  const res = await fetch(url.toString(), {
    method,
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json', ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}) },
    body: body !== undefined ? JSON.stringify(body) : undefined,
    cache: 'no-store',
    redirect: 'error',
    signal: AbortSignal.timeout(30_000),
  });
  const text = await res.text();
  let json: Record<string, unknown> = {};
  try {
    json = text ? (JSON.parse(text) as Record<string, unknown>) : {};
  } catch {
    json = { success: false, message: 'Neplatná odpověď serveru.', code: 'BAD_BACKEND_RESPONSE' };
  }
  return { status: res.status, json };
}

export function backendFailure(status: number, json: Record<string, unknown>): NextResponse {
  const message = typeof json.message === 'string' && json.message ? json.message : 'Server odmítl požadavek.';
  const code = typeof json.code === 'string' ? json.code : 'BACKEND_ERROR';
  return NextResponse.json({ ...json, success: false, message, code }, { status: status >= 400 ? status : 502, headers: { 'Cache-Control': 'no-store' } });
}

export type Access = { ok: true; token: string } | { ok: false; response: NextResponse };

export async function requireCallsAccess(request: NextRequest, opts?: { write?: boolean }): Promise<Access> {
  if (opts?.write) {
    const appOrigin = (() => {
      try {
        return new URL(process.env.NEXTAUTH_URL ?? request.nextUrl.origin).origin;
      } catch {
        return request.nextUrl.origin;
      }
    })();
    const csrf = checkCsrf({
      method: request.method,
      origin: request.headers.get('origin'),
      referer: request.headers.get('referer'),
      contentType: request.headers.get('content-type'),
      hasBody: (request.headers.get('content-length') ?? '0') !== '0',
      rawUpload: false,
      hasFileNameHeader: false,
      appOrigin,
    });
    if (!csrf.ok) return { ok: false, response: fail(403, 'Požadavek nepochází z této aplikace.', 'CSRF') };
  }
  const token = await getBackendBearer();
  if (!token) return { ok: false, response: fail(401, 'Přihlášení vypršelo, přihlaste se prosím znovu.', 'UNAUTHORIZED') };
  const fp = token.slice(-16);
  const now = Date.now();
  for (const [k, t] of okUntil) if (t < now) okUntil.delete(k);
  if ((okUntil.get(fp) ?? 0) > now) return { ok: true, token };
  try {
    const { status, json } = await backendJson(token, 'GET', 'meta');
    if (status !== 200 || json.success !== true) return { ok: false, response: backendFailure(status, json) };
  } catch (e) {
    if (e instanceof BackendConfigError) return { ok: false, response: fail(500, 'Aplikace není správně nastavena (chybí adresa serveru).', 'BACKEND_NOT_CONFIGURED') };
    return { ok: false, response: fail(503, 'Server je dočasně nedostupný, zkuste to prosím za chvíli.', 'BACKEND_UNREACHABLE') };
  }
  okUntil.set(fp, now + OK_TTL_MS);
  return { ok: true, token };
}

export function recordingsFailure(e: unknown): NextResponse {
  const msg = e instanceof Error && /Missing env var/.test(e.message) ? 'Služba nahrávek není nastavena (chybí proměnné PLAYER_*). Obraťte se na správce.' : 'Služba nahrávek neodpovídá. Zkuste to prosím za chvíli.';
  if (!(e instanceof Error && /Missing env var/.test(e.message))) console.error('recordings service error:', e instanceof Error ? e.message : e);
  return fail(502, msg, 'RECORDINGS_UNAVAILABLE');
}

export { fail };

/**
 * The call id (path) must come with the grant `/api/calls/customer` issued to this person for it (query `grant`). Without
 * it the id may belong to a customer outside the dashboard's scope: refused (403 CALL_NOT_GRANTED), the recordings service
 * is not asked.
 */
export async function requireCallGrant(request: NextRequest, callId: string): Promise<NextResponse | null> {
  const session = await getServerSession();
  const email = session?.user.email ?? null;
  const grant = request.nextUrl.searchParams.get('grant');
  let ok = false;
  try {
    ok = !!email && checkCallGrant(email, callId, grant);
  } catch {
    return fail(500, 'Aplikace není správně nastavena.', 'BACKEND_NOT_CONFIGURED');
  }
  return ok ? null : fail(403, 'K tomuto hovoru nemáte přístup (otevřete ho ze stránky hovorů zákazníka).', 'CALL_NOT_GRANTED');
}
