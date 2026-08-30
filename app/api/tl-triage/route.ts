import { NextRequest, NextResponse } from 'next/server';
import { fetchBackend } from '@/lib/backendFetch';

/** GET — TL daily triage list for a day/range (?date= or ?from=&to=). Read-only. */
export async function GET(request: NextRequest) {
  try {
    const qs = request.nextUrl.search;
    return await fetchBackend(`/api/admin/tl-triage${qs}`, { method: 'GET' });
  } catch (error: unknown) {
    return NextResponse.json(
      { success: false, message: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
