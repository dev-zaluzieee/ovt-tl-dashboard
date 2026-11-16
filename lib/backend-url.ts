/**
 * The one place that knows the backend's URL (server-side only): the ceniky-2
 * office/MVT backend, base URL WITHOUT a path (`BACKEND_API_URL`).
 *
 * In production a missing BACKEND_API_URL is a deployment mistake that would
 * otherwise look like "login works, every data call fails": it throws a
 * BackendConfigError (logged once) instead of silently using localhost.
 * Development falls back to http://localhost:3000 (the ceniky-2 backend default).
 */

export const BACKEND_CONFIG_MESSAGE = 'Aplikace není správně nastavena (chybí adresa serveru).';

export class BackendConfigError extends Error {
  constructor() {
    super('BACKEND_API_URL is not set');
    this.name = 'BackendConfigError';
  }
}

let logged = false;

export function getBackendUrl(): string {
  const url = process.env.BACKEND_API_URL?.trim();
  if (url) return url.replace(/\/+$/, '');
  if (process.env.NODE_ENV === 'production') {
    if (!logged) {
      logged = true;
      console.error('[config] BACKEND_API_URL is not set: every call to the backend will fail.');
    }
    throw new BackendConfigError();
  }
  return 'http://localhost:3000';
}

/** True when `getBackendUrl()` would throw (production without the variable). */
export function isBackendUrlMissing(): boolean {
  return process.env.NODE_ENV === 'production' && !process.env.BACKEND_API_URL?.trim();
}
