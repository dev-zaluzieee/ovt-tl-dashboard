/** Cookie store from `await cookies()` in App Router route handlers. */
export type AppRouteCookieStore = Awaited<
  ReturnType<typeof import('next/headers').cookies>
>;

type CookieSetOptions = {
  httpOnly: boolean;
  secure: boolean;
  sameSite: 'lax' | 'strict' | 'none';
  maxAge: number;
};

/**
 * HttpOnly cookie holding the Supabase access JWT (proxied to Express as Bearer).
 */
export const AUTH_ACCESS_COOKIE = 'auth_token';

/**
 * HttpOnly cookie holding the Supabase refresh token (rotated whenever backend returns a new one).
 */
export const AUTH_REFRESH_COOKIE = 'auth_refresh_token';

/** Max-Age for session cookies (seconds). */
export const SESSION_COOKIE_MAX_AGE = 60 * 60 * 24 * 7; // 7 days

function baseCookieOptions(): CookieSetOptions {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: SESSION_COOKIE_MAX_AGE,
  };
}

function displayCookieOptions(): CookieSetOptions {
  return {
    httpOnly: false,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: SESSION_COOKIE_MAX_AGE,
  };
}

/** Payload from backend /api/auth/signin and /api/auth/refresh (shape must stay aligned). */
export type AuthSessionData = {
  access_token: string;
  refresh_token: string;
  expires_at?: number;
  user: {
    id: string;
    email?: string;
    role?: string;
    raynet_id?: string | null;
    raynet_name?: string | null;
  };
};

/**
 * Write access + refresh tokens and display cookies after successful auth or refresh.
 * Always persists `refresh_token` from the response so rotated refresh tokens are not lost.
 */
export function setSessionCookiesFromAuthData(
  cookieStore: AppRouteCookieStore,
  data: AuthSessionData
): void {
  const httpOnlyBase = baseCookieOptions();

  cookieStore.set(AUTH_ACCESS_COOKIE, data.access_token, httpOnlyBase);
  cookieStore.set(AUTH_REFRESH_COOKIE, data.refresh_token, httpOnlyBase);

  const display = displayCookieOptions();
  if (data.user?.email) {
    cookieStore.set('user_email', data.user.email, display);
  }
  if (data.user?.role) {
    cookieStore.set('user_role', data.user.role, display);
  }

  const raynetId = data.user?.raynet_id ?? null;
  if (raynetId) {
    cookieStore.set('raynet_id', String(raynetId), display);
  } else {
    cookieStore.delete('raynet_id');
  }

  const raynetName = data.user?.raynet_name ?? null;
  if (raynetName) {
    cookieStore.set('raynet_name', String(raynetName), display);
  } else {
    cookieStore.delete('raynet_name');
  }
}

/** Clear all auth-related cookies (failed refresh, sign-out). */
export function clearAuthCookies(cookieStore: AppRouteCookieStore): void {
  cookieStore.delete(AUTH_ACCESS_COOKIE);
  cookieStore.delete(AUTH_REFRESH_COOKIE);
  cookieStore.delete('user_email');
  cookieStore.delete('user_role');
  cookieStore.delete('raynet_id');
  cookieStore.delete('raynet_name');
}
