import { NextRequest, NextResponse } from 'next/server';
import { fetchBackend } from '@/lib/backendFetch';

/** Proxies the OVT scoreboard for a [from, to] window (YYYY-MM-DD). */
export async function GET(request: NextRequest) {
  try {
    const from = request.nextUrl.searchParams.get('from');
    const to = request.nextUrl.searchParams.get('to');
    if (!from || !to) {
      return NextResponse.json(
        { success: false, message: 'Missing from/to (YYYY-MM-DD)' },
        { status: 400 }
      );
    }
    const qs = new URLSearchParams({ from, to });
    return await fetchBackend(`/api/admin/ovt-scoreboard?${qs.toString()}`, {
      method: 'GET',
    });
  } catch (error: unknown) {
    return NextResponse.json(
      {
        success: false,
        message: error instanceof Error ? error.message : 'Internal server error',
      },
      { status: 500 }
    );
  }
}
