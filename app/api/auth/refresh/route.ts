import { NextResponse } from 'next/server';
import { refreshSessionWithBackend } from '@/lib/backendFetch';

export async function POST() {
  try {
    const ok = await refreshSessionWithBackend();
    if (!ok) {
      return NextResponse.json(
        { success: false, message: 'Session refresh failed' },
        { status: 401 }
      );
    }
    return NextResponse.json({ success: true, message: 'Session refreshed' });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
