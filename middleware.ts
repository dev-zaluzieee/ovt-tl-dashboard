import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * Protect staff portal routes; /auth and /api stay public for sign-in flow.
 */
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname.startsWith('/auth') || pathname.startsWith('/api')) {
    return NextResponse.next();
  }

  const token = request.cookies.get('auth_token')?.value;

  if (!token && pathname !== '/auth') {
    const url = request.nextUrl.clone();
    url.pathname = '/auth';
    return NextResponse.redirect(url);
  }

  if (token && pathname === '/auth') {
    const url = request.nextUrl.clone();
    url.pathname = '/';
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
