import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { clearAuthCookies } from '@/lib/sessionCookies';

export async function POST() {
  try {
    const cookieStore = await cookies();
    clearAuthCookies(cookieStore);
    return NextResponse.json({ success: true, message: 'Signed out successfully' });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
