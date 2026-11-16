import { NextResponse, type NextRequest } from 'next/server';
import { checkCsrf } from '@/lib/csrf';
import { fail, proxyToBackend } from '@/lib/bff-proxy';
import { matchRoute, validQueryValue } from '@/lib/tl-routes';

/**
 * Browser -> Next -> backend proxy of the dashboard. The SSO access token stays in the session cookie; the helper
 * attaches `Authorization: Bearer <access token>` and calls `${BACKEND_API_URL}/api/tl2/<path>`. Only the routes in
 * lib/tl-routes.ts exist; writes need our own Origin. The access gate (proxy.ts) has already required a session; the
 * helper requires a usable token again. A 401 is passed through: the client wrapper (lib/bff-fetch.ts) renews the
 * session through /api/auth/session (the only place a rotated refresh token can be persisted) and retries ONCE.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function handle(request: NextRequest, ctx: { params: Promise<{ path: string[] }> }): Promise<NextResponse> {
  const { path } = await ctx.params;
  const method = request.method.toUpperCase();
  const route = matchRoute(method, path);
  if (!route) return fail(404, 'Neznámá adresa.', 'NOT_FOUND');

  const appOrigin = (() => {
    try {
      return new URL(process.env.NEXTAUTH_URL ?? request.nextUrl.origin).origin;
    } catch {
      return request.nextUrl.origin;
    }
  })();
  const hasBody = (request.headers.get('content-length') ?? '0') !== '0' || request.headers.has('transfer-encoding');
  const csrf = checkCsrf({
    method,
    origin: request.headers.get('origin'),
    referer: request.headers.get('referer'),
    contentType: request.headers.get('content-type'),
    hasBody,
    rawUpload: false,
    hasFileNameHeader: false,
    appOrigin,
  });
  if (!csrf.ok) return fail(403, csrf.reason === 'ORIGIN' ? 'Požadavek nepochází z této aplikace.' : 'Neplatný typ požadavku.', 'CSRF');

  // Only whitelisted query parameters with valid values reach the backend.
  const query: Record<string, string> = {};
  for (const key of route.query ?? []) {
    const value = request.nextUrl.searchParams.get(key);
    if (value === null) continue;
    if (!validQueryValue(key, value)) return fail(400, 'Neplatný parametr požadavku.', 'BAD_QUERY');
    query[key] = value;
  }

  return proxyToBackend(request, { method: method as 'GET' | 'POST' | 'PUT' | 'DELETE', path: path.join('/'), query, body: route.body === true });
}

export { handle as GET, handle as POST, handle as PUT, handle as DELETE };
