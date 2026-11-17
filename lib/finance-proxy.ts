/**
 * Server side of the Hotovost pages: forwards ONE read to the finance backend (`${FINANCE_API_URL}/api/tl/cash/<path>`) with
 * the signed-in user's own SSO access token as the bearer (lib/auth-backend.ts). The token never reaches the browser, no
 * other identity is sent, nothing is cached. Read-only: GET only.
 *
 * Token expiry: an expired or rejected token (`401 TOKEN_EXPIRED` / `UNAUTHORIZED`) is passed through as 401; the browser
 * wrapper (lib/bff-fetch.ts) renews the session through /api/auth/session (the only place a rotated refresh token can be
 * stored) and retries once. Refreshing here would lose the rotated token and break the session.
 *
 * Downloads (receipts) are streamed back without buffering; only images and PDF keep their type, anything else is sent as a
 * download.
 */

import { NextResponse } from 'next/server';
import { getBackendBearer } from '@/lib/auth-backend';
import { fail } from '@/lib/bff-proxy';
import { CASH_NOT_CONFIGURED_MESSAGE, cashHttpStatus } from '@/lib/cash';
import { getFinanceUrl } from '@/lib/finance-url';

const NO_STORE = { 'Cache-Control': 'no-store' };

const STATUS_MESSAGES: Record<number, string> = {
  401: 'Přihlášení vypršelo, přihlaste se prosím znovu.',
  403: 'K přehledu hotovosti nemáte oprávnění.',
  404: 'Záznam nebyl nalezen.',
  503: 'Finance jsou dočasně nedostupné, zkuste to prosím za chvíli.',
};

function errorBody(status: number, json: unknown): Record<string, unknown> {
  const o = json && typeof json === 'object' && !Array.isArray(json) ? { ...(json as Record<string, unknown>) } : {};
  const msg = typeof o.message === 'string' && o.message.trim() ? o.message : typeof o.error === 'string' && o.error.trim() ? o.error : null;
  return { ...o, success: false, message: msg ?? STATUS_MESSAGES[status] ?? 'Něco se nepovedlo, zkuste to prosím znovu.' };
}

async function call(path: string): Promise<{ res: Response } | { out: NextResponse }> {
  const base = getFinanceUrl();
  if (!base) return { out: fail(503, CASH_NOT_CONFIGURED_MESSAGE, 'FINANCE_NOT_CONFIGURED') };
  const token = await getBackendBearer();
  if (!token) return { out: fail(401, STATUS_MESSAGES[401], 'UNAUTHORIZED') };
  try {
    const res = await fetch(`${base}/api/tl/cash/${path}`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}`, Accept: '*/*' },
      cache: 'no-store',
      redirect: 'error',
      signal: AbortSignal.timeout(30_000),
    });
    return { res };
  } catch (error) {
    console.error(`Fetch error when calling finance GET ${path}:`, error instanceof Error ? error.message : error);
    return { out: fail(503, STATUS_MESSAGES[503], 'FINANCE_UNREACHABLE') };
  }
}

async function failedAnswer(res: Response): Promise<NextResponse> {
  const json = (await res.json().catch(() => null)) as unknown;
  const code = json && typeof json === 'object' && typeof (json as { code?: unknown }).code === 'string' ? (json as { code: string }).code : null;
  const status = cashHttpStatus(res.status, code);
  return NextResponse.json(errorBody(status, json), { status, headers: NO_STORE });
}

/** JSON read: `persons`, `persons/<id>`. */
export async function financeJson(path: string): Promise<NextResponse> {
  try {
    const r = await call(path);
    if ('out' in r) return r.out;
    if (!r.res.ok) return await failedAnswer(r.res);
    const text = await r.res.text();
    try {
      return NextResponse.json(text ? JSON.parse(text) : {}, { status: 200, headers: NO_STORE });
    } catch {
      return fail(502, 'Neplatná odpověď serveru.', 'BAD_BACKEND_RESPONSE');
    }
  } catch (error) {
    console.error(`Error in cash BFF GET ${path}:`, error);
    return fail(500, 'Interní chyba serveru.', 'INTERNAL');
  }
}

/** File read: `attachments/<id>`, streamed. */
export async function financeFile(path: string): Promise<Response> {
  try {
    const r = await call(path);
    if ('out' in r) return r.out;
    if (!r.res.ok) return await failedAnswer(r.res);
    const type = (r.res.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase();
    const safe = type === 'application/pdf' || /^image\/(png|jpe?g|gif|webp|heic|heif)$/.test(type);
    const headers = new Headers({ 'Content-Type': safe ? type : 'application/octet-stream', 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'private, max-age=300' });
    const disposition = r.res.headers.get('content-disposition');
    if (safe && disposition) headers.set('Content-Disposition', disposition);
    else if (!safe) headers.set('Content-Disposition', 'attachment');
    return new Response(r.res.body, { status: 200, headers });
  } catch (error) {
    console.error(`Error in cash BFF GET ${path}:`, error);
    return fail(500, 'Interní chyba serveru.', 'INTERNAL');
  }
}
