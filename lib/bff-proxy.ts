/**
 * One helper behind the BFF route (`/api/tl/[...path]`): forwards a request to the backend
 * (`${BACKEND_API_URL}/api/tl2/<path>`) with the signed-in team leader's SSO bearer (lib/auth-backend.ts) and hands the
 * answer back (status and JSON).
 *
 * Errors keep the backend's `{code, message}` (a `message` is always present, in Czech) and any extra fields (`missing`,
 * `data.steps`, `ref`); the helper adds the same shape for its own failures (no session, backend unreachable, missing
 * BACKEND_API_URL).
 */

import { NextResponse, type NextRequest } from 'next/server';
import { getBackendBearer } from '@/lib/auth-backend';
import { BACKEND_CONFIG_MESSAGE, BackendConfigError, getBackendUrl } from '@/lib/backend-url';
import { JSON_MAX_BYTES } from '@/lib/tl-routes';

export interface ProxyOptions {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  /** Path below `/api/tl2/`, e.g. `ovt/day`. Already validated against the allow-list. */
  path: string;
  /** Query parameters to forward (name -> value); undefined / empty are skipped. */
  query?: Record<string, string | null | undefined>;
  /** Forward the JSON request body. */
  body?: boolean;
}

export function fail(status: number, message: string, code?: string): NextResponse {
  return NextResponse.json({ success: false, message, ...(code ? { code } : {}) }, { status, headers: { 'Cache-Control': 'no-store' } });
}

const STATUS_MESSAGES: Record<number, string> = {
  400: 'Požadavek není v pořádku.',
  401: 'Přihlášení vypršelo, přihlaste se prosím znovu.',
  403: 'K této akci nemáte oprávnění.',
  404: 'Záznam nebyl nalezen.',
  409: 'Záznam se mezitím změnil, obnovte prosím stránku.',
  413: 'Požadavek je příliš velký.',
  423: 'Zakázku právě upravuje někdo jiný (je zamčená).',
  502: 'ERP vrátilo chybu.',
  503: 'Server je dočasně nedostupný, zkuste to prosím za chvíli.',
};

/** Error bodies always leave with a Czech `message`; `code` and any extra fields are kept. */
function normalizeError(status: number, json: unknown): unknown {
  const obj = json && typeof json === 'object' && !Array.isArray(json) ? { ...(json as Record<string, unknown>) } : {};
  const msg = typeof obj.message === 'string' && obj.message.trim() ? obj.message : typeof obj.error === 'string' && obj.error.trim() ? obj.error : null;
  obj.message = msg ?? STATUS_MESSAGES[status] ?? 'Něco se nepovedlo, zkuste to prosím znovu.';
  return obj;
}

export async function proxyToBackend(request: NextRequest, opts: ProxyOptions): Promise<NextResponse> {
  try {
    const token = await getBackendBearer();
    if (!token) return fail(401, STATUS_MESSAGES[401], 'UNAUTHORIZED');

    const url = new URL(`/api/tl2/${opts.path}`, getBackendUrl());
    for (const [k, v] of Object.entries(opts.query ?? {})) {
      if (v) url.searchParams.set(k, v);
    }

    const headers: Record<string, string> = { Authorization: `Bearer ${token}`, Accept: 'application/json' };
    let body: BodyInit | undefined;
    if (opts.body) {
      const declared = Number(request.headers.get('content-length') ?? '0');
      if (declared > JSON_MAX_BYTES) return fail(413, STATUS_MESSAGES[413], 'TOO_LARGE');
      const text = await request.text();
      if (text.length > JSON_MAX_BYTES) return fail(413, STATUS_MESSAGES[413], 'TOO_LARGE');
      headers['Content-Type'] = 'application/json';
      body = text;
    }

    let res: Response;
    try {
      res = await fetch(url.toString(), { method: opts.method, headers, body, cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(60_000) });
    } catch (error) {
      console.error(`Fetch error when calling backend ${opts.method} ${opts.path}:`, error instanceof Error ? error.message : error);
      return fail(503, STATUS_MESSAGES[503], 'BACKEND_UNREACHABLE');
    }

    const text = await res.text();
    let json: unknown = null;
    try {
      json = text ? JSON.parse(text) : {};
    } catch {
      return fail(502, 'Neplatná odpověď serveru.', 'BAD_BACKEND_RESPONSE');
    }
    if (!res.ok) return NextResponse.json(normalizeError(res.status, json), { status: res.status, headers: { 'Cache-Control': 'no-store' } });
    return NextResponse.json(json, { status: res.status, headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    if (error instanceof BackendConfigError) return fail(500, BACKEND_CONFIG_MESSAGE, 'BACKEND_NOT_CONFIGURED');
    console.error(`Error in BFF ${opts.method} ${opts.path}:`, error);
    return fail(500, 'Interní chyba serveru.', 'INTERNAL');
  }
}
