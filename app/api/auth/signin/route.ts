import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { setSessionCookiesFromAuthData } from '@/lib/sessionCookies';
import { isStaffRole } from '@/lib/staffRoles';

/**
 * TL dashboard sign-in: only the admin role may receive a session (team leaders are admins).
 * Same backend as ceniky-2.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, password } = body;

    if (!email || !password) {
      return NextResponse.json(
        { success: false, message: 'Email and password are required' },
        { status: 400 }
      );
    }

    const apiUrl = process.env.API_URL || 'http://localhost:3000';
    const response = await fetch(`${apiUrl}/api/auth/signin`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email, password }),
    });

    const data = await response.json();

    if (!response.ok) {
      return NextResponse.json(data, { status: response.status });
    }

    const userRole = data.data?.user?.role as string | undefined;
    if (!isStaffRole(userRole)) {
      return NextResponse.json(
        {
          success: false,
          message:
            'Přístup do portálu má pouze role Administrátor. Kontaktujte správce systému.',
        },
        { status: 403 }
      );
    }

    if (
      data.success &&
      data.data?.access_token &&
      data.data?.refresh_token &&
      data.data?.user
    ) {
      const cookieStore = await cookies();
      setSessionCookiesFromAuthData(cookieStore, data.data);
    }

    return NextResponse.json(data);
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
