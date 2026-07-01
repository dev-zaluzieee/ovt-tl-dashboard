import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import {
  clearAuthCookies,
  setSessionCookiesFromAuthData,
  type AuthSessionData,
} from './sessionCookies';
import { isStaffRole } from './staffRoles';

export async function getAuthToken(): Promise<string | undefined> {
  const cookieStore = await cookies();
  return cookieStore.get('auth_token')?.value;
}

/**
 * Refresh session; only admin | team_leader may keep a session on this app.
 */
export async function refreshSessionWithBackend(): Promise<boolean> {
  const cookieStore = await cookies();
  const refreshToken = cookieStore.get('auth_refresh_token')?.value;
  if (!refreshToken) {
    return false;
  }

  const apiUrl = process.env.API_URL || 'http://localhost:3000';
  let response: Response;
  try {
    response = await fetch(`${apiUrl}/api/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: refreshToken }),
    });
  } catch {
    clearAuthCookies(cookieStore);
    return false;
  }

  let data: { success?: boolean; data?: AuthSessionData };
  try {
    data = await response.json();
  } catch {
    clearAuthCookies(cookieStore);
    return false;
  }

  if (
    !response.ok ||
    !data.success ||
    !data.data?.access_token ||
    !data.data?.refresh_token
  ) {
    clearAuthCookies(cookieStore);
    return false;
  }

  if (!isStaffRole(data.data.user?.role)) {
    clearAuthCookies(cookieStore);
    return false;
  }

  setSessionCookiesFromAuthData(cookieStore, data.data);
  return true;
}

function mergeHeaders(accessToken: string, options: RequestInit): Headers {
  const headers = new Headers(options.headers);
  headers.set('Authorization', `Bearer ${accessToken}`);
  if (
    !headers.has('Content-Type') &&
    options.body != null &&
    !(options.body instanceof FormData)
  ) {
    headers.set('Content-Type', 'application/json');
  }
  return headers;
}

async function responseToNextResponse(response: Response): Promise<NextResponse> {
  const contentType = response.headers.get('content-type');
  if (!contentType || !contentType.includes('application/json')) {
    const text = await response.text();
    console.error('Backend returned non-JSON response:', text.substring(0, 200));
    return NextResponse.json(
      {
        success: false,
        message: 'Backend returned non-JSON response',
        details: text.substring(0, 200),
      },
      { status: response.status || 500 }
    );
  }

  let responseData: unknown;
  try {
    responseData = await response.json();
  } catch {
    responseData = { success: false, message: 'Invalid response from backend' };
  }
  return NextResponse.json(responseData, { status: response.status });
}

/** Proxy to backend with Bearer auth; retries once after refresh on 401. */
export async function fetchBackend(
  url: string,
  options: RequestInit = {}
): Promise<NextResponse> {
  const apiUrl = process.env.API_URL || 'http://localhost:3000';
  const fullUrl = `${apiUrl}${url}`;

  const doFetch = (accessToken: string) =>
    fetch(fullUrl, {
      ...options,
      headers: mergeHeaders(accessToken, options),
    });

  let token = await getAuthToken();
  if (!token) {
    return NextResponse.json(
      { success: false, message: 'Not authenticated' },
      { status: 401 }
    );
  }

  let response: Response;
  try {
    response = await doFetch(token);
  } catch (error: unknown) {
    console.error('Error fetching from backend:', error);
    return NextResponse.json(
      {
        success: false,
        message:
          error instanceof Error ? error.message : 'Failed to fetch from backend',
      },
      { status: 500 }
    );
  }

  if (response.status === 401) {
    const refreshed = await refreshSessionWithBackend();
    if (refreshed) {
      token = await getAuthToken();
      if (token) {
        try {
          response = await doFetch(token);
        } catch (error: unknown) {
          console.error('Error fetching from backend after refresh:', error);
          return NextResponse.json(
            {
              success: false,
              message:
                error instanceof Error
                  ? error.message
                  : 'Failed to fetch from backend',
            },
            { status: 500 }
          );
        }
      }
    }
  }

  return responseToNextResponse(response);
}
