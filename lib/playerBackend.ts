/**
 * Client for the standalone Daktela player backend (separate Railway service).
 *
 * The player backend exposes a NestJS JWT auth: log in with a fixed service
 * account, cache the accessToken in-memory, retry on 401. TL dashboard is the
 * only consumer — we deliberately keep this thin (no fancy connection pool).
 *
 * Env vars (set on ovt-tl-dashboard):
 *   PLAYER_BACKEND_URL      — https://ovt-daktela-backend.up.railway.app (no trailing slash)
 *   PLAYER_SERVICE_EMAIL    — service account login
 *   PLAYER_SERVICE_PASSWORD — service account password
 *
 * The service account should be a `manager` role in the player app with access
 * to every monitored queue (assigned by the player-app admin) so it sees all
 * calls across the org.
 */

const JWT_TTL_MS = 7 * 60 * 60 * 1000; // player app issues 8h JWT; refresh at 7h.

interface PlayerCallRow {
  id: string;
  externalCallId: string | null;
  customerName: string | null;
  phone: string | null;
  agent: string | null;
  queue: string | null;
  callTime: string;
  hasRecording: boolean;
  hasS3Recording: boolean;
  recordingStatus: 'available' | 'missing' | 'error';
  canAttemptDownload: boolean;
  canPlay: boolean;
  canUnlockPlayback: boolean;
  isPlaybackUnlocked: boolean;
}

interface CachedJwt {
  token: string;
  issuedAt: number;
}

let cachedJwt: CachedJwt | null = null;

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v || v.trim().length === 0) {
    throw new Error(`Missing env var: ${name}`);
  }
  return v.trim();
}

function baseUrl(): string {
  return requireEnv('PLAYER_BACKEND_URL').replace(/\/$/, '');
}

async function login(): Promise<string> {
  const email = requireEnv('PLAYER_SERVICE_EMAIL');
  const password = requireEnv('PLAYER_SERVICE_PASSWORD');
  const res = await fetch(`${baseUrl()}/api/auth/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) {
    throw new Error(`player-backend login failed (${res.status})`);
  }
  const body = (await res.json()) as { accessToken?: string };
  if (!body.accessToken || typeof body.accessToken !== 'string') {
    throw new Error('player-backend login returned no accessToken');
  }
  cachedJwt = { token: body.accessToken, issuedAt: Date.now() };
  return body.accessToken;
}

async function getToken(force = false): Promise<string> {
  if (
    !force &&
    cachedJwt &&
    Date.now() - cachedJwt.issuedAt < JWT_TTL_MS
  ) {
    return cachedJwt.token;
  }
  return login();
}

/** Fetch with auth + one automatic re-login on 401. */
async function authedFetch(
  path: string,
  init?: RequestInit
): Promise<Response> {
  const url = `${baseUrl()}${path}`;
  const attempt = async (token: string): Promise<Response> =>
    fetch(url, {
      ...init,
      headers: {
        ...(init?.headers ?? {}),
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
      },
    });

  const first = await attempt(await getToken());
  if (first.status !== 401) return first;
  // Token likely expired or invalidated — force fresh login and retry once.
  const refreshed = await attempt(await getToken(true));
  return refreshed;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export type PlayerCall = PlayerCallRow;

/** Fetch every call the service account can see. Player backend doesn't filter
 *  server-side — callers apply their own predicate (usually phone match). */
export async function fetchAllCalls(): Promise<PlayerCall[]> {
  const res = await authedFetch('/api/calls', { method: 'GET' });
  if (!res.ok) {
    throw new Error(`player-backend /calls failed (${res.status})`);
  }
  const body = (await res.json()) as PlayerCall[] | { data?: PlayerCall[] };
  return Array.isArray(body) ? body : (body.data ?? []);
}

/** Get the short-lived presigned S3 URL for the given call. Throws if the
 *  recording isn't in S3 yet, or the caller doesn't have access. */
export async function fetchCallPlayUrl(callId: string): Promise<string> {
  const res = await authedFetch(
    `/api/calls/${encodeURIComponent(callId)}/play`,
    { method: 'GET' }
  );
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(
      `player-backend /calls/:id/play failed (${res.status}): ${text || 'no body'}`
    );
  }
  const body = (await res.json()) as { url?: string };
  if (!body.url || typeof body.url !== 'string') {
    throw new Error('player-backend /calls/:id/play returned no url');
  }
  return body.url;
}

// ---------------------------------------------------------------------------
// Phone match key — must produce the same output as the ceniky-2 backend
// helper. Loose match: last 9 digits (Czech phone length), ignoring country
// code + formatting so `+420 604 932 241` matches Daktela's `604932241`.
// Numbers shorter than 9 digits use whatever they have.
// ---------------------------------------------------------------------------

export function normalizePhone(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  const digits = raw.replace(/[^0-9]/g, '');
  if (digits.length === 0) return null;
  return digits.length > 9 ? digits.slice(-9) : digits;
}
