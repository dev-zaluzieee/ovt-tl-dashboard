'use client';

/**
 * Client of the app's own Hotovost routes (`/api/cash/*`): through `bffFetch` (one silent session renewal on a 401), the
 * answer comes back as finance's `data` or a `TlApiError` with finance's code and Czech message.
 */

import { bffFetch } from '@/lib/bff-fetch';
import { TlApiError, errorText } from '@/lib/tl-errors';
import { CASH_MESSAGE_CODES } from '@/lib/cash';

async function read(res: Response): Promise<unknown> {
  const json = (await res.json().catch(() => null)) as Record<string, unknown> | null;
  if (!res.ok || !json || json.success === false) {
    const body = json ?? {};
    throw new TlApiError(res.status, typeof body.message === 'string' ? body.message : `Chyba serveru (${res.status}).`, typeof body.code === 'string' ? body.code : null, body);
  }
  return json.data;
}

export async function cashGet(path: string, signal?: AbortSignal): Promise<unknown> {
  return read(await bffFetch(`/api/cash/${path}`, { headers: { Accept: 'application/json' }, signal }));
}

/** Czech text of a failed Hotovost call: finance's own message for its codes, the dashboard's wording for the rest. */
export function cashErrorText(e: unknown): string {
  if (e instanceof TlApiError && e.code && CASH_MESSAGE_CODES.has(e.code) && e.message.trim()) return e.message.trim();
  return errorText(e, 'Data se nepodařilo načíst.');
}

export function isCashNotConfigured(e: unknown): boolean {
  return e instanceof TlApiError && e.code === 'FINANCE_NOT_CONFIGURED';
}
