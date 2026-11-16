/**
 * Permission to play or analyse ONE recording. The recordings service is called with a shared service account and knows
 * nothing about the dashboard's scope, so the app itself decides which call ids a person may open: only those that
 * `/api/calls/customer` returned to THAT person (for the phones the backend confirmed as in scope) in a lookup.
 * Each returned call carries a grant = HMAC-SHA256(NEXTAUTH_SECRET, person | call id | expiry). `/api/calls/play` and
 * `/api/calls/analysis` refuse a call id without a valid grant of the same person. Stateless (works across server instances);
 * limits: a grant can be used again until it expires (8 h, the lifetime of the recordings service's own login) and it is
 * not revoked when the person's scope later changes.
 */

import { createHmac, timingSafeEqual } from 'node:crypto';

export const GRANT_TTL_MS = 8 * 60 * 60 * 1000;

function secret(): string {
  const s = process.env.NEXTAUTH_SECRET;
  if (!s) throw new Error('Missing env var: NEXTAUTH_SECRET');
  return s;
}

function mac(email: string, callId: string, exp: number): string {
  return createHmac('sha256', secret()).update(`call-grant|${email.toLowerCase()}|${callId}|${exp}`).digest('base64url');
}

/** `<expiry ms>.<mac>` */
export function issueCallGrant(email: string, callId: string, now = Date.now()): string {
  const exp = now + GRANT_TTL_MS;
  return `${exp}.${mac(email, callId, exp)}`;
}

export function checkCallGrant(email: string, callId: string, grant: string | null | undefined, now = Date.now()): boolean {
  if (!grant || grant.length > 200) return false;
  const [expRaw, given] = grant.split('.');
  const exp = Number(expRaw);
  if (!Number.isFinite(exp) || exp < now || !given) return false;
  const want = Buffer.from(mac(email, callId, exp));
  const got = Buffer.from(given);
  return want.length === got.length && timingSafeEqual(want, got);
}
