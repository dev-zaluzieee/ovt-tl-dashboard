import { NextResponse, type NextRequest } from 'next/server';
import { safeCallbackPath } from '@/lib/safe-callback';

/**
 * The session is dead (the SSO refused the refresh token: `invalid_grant`). Clears the LOCAL session cookies and goes to
 * /login with the page the user was on, so the sign-in returns there. No SSO end_session: that session is gone anyway,
 * and a redirect through it would lose the URL. Public under /api/auth (see proxy.ts).
 */
export async function GET(request: NextRequest) {
  const callback = safeCallbackPath(request.nextUrl.searchParams.get('callbackUrl'));
  const base = process.env.NEXTAUTH_URL ?? request.url;
  const login = new URL('/login', base);
  login.searchParams.set('callbackUrl', callback);
  const response = NextResponse.redirect(login);
  const names = new Set<string>([
    'next-auth.session-token',
    '__Secure-next-auth.session-token',
    'next-auth.csrf-token',
    '__Host-next-auth.csrf-token',
    'next-auth.callback-url',
    '__Secure-next-auth.callback-url',
    'tl-renewed',
  ]);
  // The session token may be chunked (".0", ".1", ...).
  for (const { name } of request.cookies.getAll()) {
    const bare = name.replace(/^(?:__Secure-|__Host-)/, '');
    if (bare.startsWith('next-auth.session-token')) names.add(name);
  }
  for (const name of names) {
    const prefixed = name.startsWith('__Secure-') || name.startsWith('__Host-');
    response.cookies.set(name, '', { path: '/', expires: new Date(0), secure: prefixed, httpOnly: true, sameSite: 'lax' });
  }
  response.headers.set('Cache-Control', 'no-store');
  return response;
}
