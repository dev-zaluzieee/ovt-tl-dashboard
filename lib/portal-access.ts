/**
 * What this environment (branch byebyeraynet: no Raynet, no Supabase, no teams) shows and serves.
 *
 * Every page and API route of the old dashboard that is not listed here is not reachable: pages go back to the start,
 * APIs answer 404. Add a route here only when its backend works without Raynet. Pure functions, no Next imports (used by
 * proxy.ts and the contract check).
 */

const ID = '[1-9][0-9]{0,15}';
export const PAGE_PATTERNS: readonly RegExp[] = [
  /^\/$/,
  /^\/login$/,
  /^\/ovt$/,
  /^\/prehled-dne$/,
  /^\/problematicke-zakazky$/,
  /^\/vysledky$/,
  /^\/recenze-qr$/,
  /^\/mvt$/,
  /^\/mvt\/prehled-dne$/,
  /^\/mvt\/nedokoncene$/,
  /^\/mvt\/opravy$/,
  /^\/mvt\/nesedi-doplatek$/,
  /^\/mvt\/zapisy$/,
  new RegExp(`^/mvt/zapisy/${ID}$`),
  /^\/mvt\/zachrany$/,
  /^\/mvt\/reklamace$/,
  /^\/mvt\/eskalace$/,
  /^\/objednavky-s-hovory$/,
  /^\/hotovost$/,
  new RegExp(`^/hotovost/${ID}$`),
  new RegExp(`^/zakaznik/${ID}/hovory$`),
  new RegExp(`^/zakazka/${ID}/hovory$`),
];

export function isPageEnabled(pathname: string): boolean {
  return PAGE_PATTERNS.some((re) => re.test(pathname));
}

/** The only API trees besides `/api/auth/*`: the backend proxy, the recordings routes and the Hotovost routes (each verifies the session itself too). */
export function isApiEnabled(pathname: string): boolean {
  return pathname === '/api/tl' || pathname.startsWith('/api/tl/') || pathname.startsWith('/api/calls/') || pathname.startsWith('/api/cash/');
}

/**
 * `/api/auth/*` paths that are public (no session needed): NextAuth's own endpoints plus our `renew`, `sso-logout` and
 * `session-expired`. Exact segment match; everything else under /api/auth answers 404. Nothing else is public except
 * /login and Next's static assets (see the matcher in proxy.ts).
 */
const AUTH_EXACT = new Set(['session', 'csrf', 'providers', 'signin', 'signout', 'error', '_log', 'renew', 'sso-logout', 'session-expired']);
const AUTH_WITH_PROVIDER = new Set(['signin', 'callback']);

export function isPublicAuthPath(pathname: string): boolean {
  if (!pathname.startsWith('/api/auth/')) return false;
  const parts = pathname.slice('/api/auth/'.length).split('/');
  if (parts.some((p) => p === '' || p === '.' || p === '..' || /[^A-Za-z0-9_-]/.test(p))) return false;
  if (parts.length === 1) return AUTH_EXACT.has(parts[0]);
  if (parts.length === 2) return AUTH_WITH_PROVIDER.has(parts[0]) && parts[1] === 'demaxia';
  return false;
}
