import { getToken } from 'next-auth/jwt';
import { NextResponse, type NextRequest } from 'next/server';
import { safeCallbackPath } from '@/lib/safe-callback';
import { isApiEnabled, isPageEnabled, isPublicAuthPath } from '@/lib/portal-access';
import { BACKEND_CONFIG_MESSAGE, isBackendUrlMissing } from '@/lib/backend-url';

/**
 * Access gate of the team leader dashboard (Next 16 `proxy`, formerly middleware). Demaxia SSO only.
 *
 * 1. Pages and APIs that are not in `lib/portal-access.ts` are not reachable: pages go to the start page, APIs answer 404
 *    (old routes to Raynet / Supabase / teams / hotovost). The old middleware let EVERY /api path through without a
 *    session; here only /api/auth/* (listed) is public.
 * 2. A valid SSO session is required (pages redirect to /login with a same-site callbackUrl, APIs answer 401 JSON).
 *    A JWT whose refresh failed (token.error) counts as no session; pages are bounced through
 *    /api/auth/session-expired, which clears the cookie and re-logs in with the same URL.
 * 3. A page navigation with a (nearly) expired access token goes through /api/auth/renew, the only place besides
 *    /api/auth/session where a refresh can be persisted (the SSO rotates refresh tokens on every use).
 *
 * Public without a session (see `config.matcher`): /login, Next static assets and the exact brand files (favicon, logos).
 * There is NO extension-based skip: /api/x.png stays protected.
 */

const RENEW_LEEWAY_MS = 150_000; // same as REFRESH_LEEWAY_MS in lib/auth.ts
const RENEWED_COOKIE = 'tl-renewed';

function isPrefetch(req: NextRequest): boolean {
  return (
    req.headers.has('next-router-prefetch') ||
    req.headers.get('purpose') === 'prefetch' ||
    req.headers.get('sec-purpose')?.includes('prefetch') === true
  );
}

/** Path + query of the request without Next's internal `_rsc` parameter. */
function pathWithSearch(req: NextRequest): string {
  const params = new URLSearchParams(req.nextUrl.search);
  params.delete('_rsc');
  const qs = params.toString();
  return safeCallbackPath(`${req.nextUrl.pathname}${qs ? `?${qs}` : ''}`);
}

let originChecked = false;

/** One log line at the first request when NEXTAUTH_URL is missing or differs from the origin the request came in on. */
function checkAuthUrlOnce(req: NextRequest): void {
  if (originChecked || process.env.NODE_ENV !== 'production') return;
  originChecked = true;
  const configured = process.env.NEXTAUTH_URL;
  if (!configured) {
    console.error('[config] NEXTAUTH_URL is not set: SSO sign-in will use http://localhost:3000 and fail.');
    return;
  }
  try {
    const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host');
    const proto = (req.headers.get('x-forwarded-proto') ?? req.nextUrl.protocol.replace(':', '')).split(',')[0];
    if (!host) return;
    const requestOrigin = `${proto}://${host.split(',')[0].trim()}`;
    const configuredOrigin = new URL(configured).origin;
    if (requestOrigin !== configuredOrigin) {
      console.error(
        `[config] NEXTAUTH_URL (${configuredOrigin}) does not match the request origin (${requestOrigin}); ` +
          'sign-in may fail. Ignore this line if the request came through an internal address.',
      );
    }
  } catch {
    console.error('[config] NEXTAUTH_URL is not a valid URL.');
  }
}

export async function proxy(req: NextRequest) {
  checkAuthUrlOnce(req);
  const { pathname } = req.nextUrl;
  const isApi = pathname.startsWith('/api/');
  // Behind a reverse proxy req.url may carry an internal host; prefer the public URL.
  const base = process.env.NEXTAUTH_URL ?? req.url;

  if (pathname.startsWith('/api/auth/') || pathname === '/api/auth') {
    if (isPublicAuthPath(pathname)) return NextResponse.next();
    return NextResponse.json({ success: false, message: 'Neznámá adresa.', code: 'NOT_FOUND' }, { status: 404 });
  }
  if (isApi && !isApiEnabled(pathname)) {
    return NextResponse.json(
      { success: false, message: 'Tato část aplikace v tomto prostředí není dostupná.', code: 'NOT_AVAILABLE' },
      { status: 404 },
    );
  }
  if (!isApi && !isPageEnabled(pathname)) {
    return NextResponse.redirect(new URL('/', base));
  }

  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });

  if (token && !token.error) {
    const expiresAt = typeof token.expires_at === 'number' ? token.expires_at : null;
    const nearExpiry = expiresAt !== null && Date.now() >= expiresAt - RENEW_LEEWAY_MS;
    if (!isApi && nearExpiry && !isPrefetch(req) && !req.cookies.has(RENEWED_COOKIE)) {
      const renew = new URL('/api/auth/renew', base);
      renew.searchParams.set('callbackUrl', pathWithSearch(req));
      return NextResponse.redirect(renew);
    }
    // Production without BACKEND_API_URL: say so loudly instead of a vague failure per call.
    if (isApi && pathname.startsWith('/api/tl/') && isBackendUrlMissing()) {
      console.error('[config] BACKEND_API_URL is not set: every call to the backend fails.');
      return NextResponse.json({ success: false, message: BACKEND_CONFIG_MESSAGE, code: 'BACKEND_NOT_CONFIGURED' }, { status: 500 });
    }
    return NextResponse.next();
  }

  if (isApi) {
    return NextResponse.json(
      { success: false, message: 'Přihlášení vypršelo, přihlaste se prosím znovu.', code: 'UNAUTHORIZED' },
      { status: 401 },
    );
  }
  if (token?.error) {
    // The refresh token is dead (invalid_grant): clear the local session and re-login, keeping the current URL.
    const expired = new URL('/api/auth/session-expired', base);
    expired.searchParams.set('callbackUrl', pathWithSearch(req));
    return NextResponse.redirect(expired);
  }

  const login = new URL('/login', base);
  login.searchParams.set('callbackUrl', pathWithSearch(req));
  return NextResponse.redirect(login);
}

export const config = {
  // Skipped (public): /login, Next static assets and the exact brand files (favicon, logos).
  // No extension-based skip: dynamic routes such as /api/x.png stay protected.
  matcher: [
    '/((?!login(?:/|$)|_next/static(?:/|$)|_next/image(?:/|$)|favicon\\.ico$|logo-zaluzieee\\.png$|logo\\.svg$).*)',
  ],
};
