'use client';

/**
 * Client of the app's own BFF (`/api/tl/*`): every call goes through `bffFetch` (one silent session renewal on a 401)
 * and comes back as the backend's `data` or a `TlApiError` with the backend's code and Czech message.
 */

import { bffFetch } from '@/lib/bff-fetch';
import { TlApiError } from '@/lib/tl-errors';

export { TlApiError, errorText, isAuthError } from '@/lib/tl-errors';

export type Query = Record<string, string | number | boolean | null | undefined>;

function qs(query?: Query): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(query ?? {})) {
    if (v === undefined || v === null || v === '' || v === false) continue;
    p.set(k, v === true ? '1' : String(v));
  }
  const s = p.toString();
  return s ? `?${s}` : '';
}

async function read(res: Response): Promise<unknown> {
  const json = (await res.json().catch(() => null)) as Record<string, unknown> | null;
  if (!res.ok || !json || json.success === false) {
    const body = json ?? {};
    throw new TlApiError(res.status, typeof body.message === 'string' ? body.message : `Chyba serveru (${res.status}).`, typeof body.code === 'string' ? body.code : null, body);
  }
  return json.data;
}

export async function tlGet(path: string, query?: Query, signal?: AbortSignal): Promise<unknown> {
  return read(await bffFetch(`/api/tl/${path}${qs(query)}`, { headers: { Accept: 'application/json' }, signal }));
}

export async function tlSend(method: 'POST' | 'PUT' | 'DELETE', path: string, body?: unknown): Promise<unknown> {
  return read(
    await bffFetch(`/api/tl/${path}`, {
      method,
      headers: { Accept: 'application/json', ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}) },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    }),
  );
}

/** Same as `tlGet` for the app's own recordings routes (`/api/calls/*`). */
export async function callsGet(path: string, query?: Query, signal?: AbortSignal): Promise<unknown> {
  return read(await bffFetch(`/api/calls/${path}${qs(query)}`, { headers: { Accept: 'application/json' }, signal }));
}

export async function callsSend(method: 'POST', path: string, query?: Query): Promise<unknown> {
  return read(await bffFetch(`/api/calls/${path}${qs(query)}`, { method, headers: { Accept: 'application/json' } }));
}
