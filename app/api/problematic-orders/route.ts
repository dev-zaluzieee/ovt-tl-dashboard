import { NextRequest, NextResponse } from 'next/server';
import { fetchBackend } from '@/lib/backendFetch';

/**
 * Proxies the TL "problematic orders" list (raynet-only / no-ADMF / nezastižen).
 * Forwards `day` (single-day mode) or `from`/`to` (range mode) straight
 * through to the backend — see app/api/admin/problematic-orders on the
 * ceniky-2 backend for the query contract. Read-only.
 */
export async function GET(request: NextRequest) {
  try {
    const qs = request.nextUrl.search;
    return await fetchBackend(`/api/admin/problematic-orders${qs}`, {
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
