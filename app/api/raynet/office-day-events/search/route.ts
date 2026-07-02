import { NextRequest, NextResponse } from 'next/server';
import { fetchBackend } from '@/lib/backendFetch';

/**
 * Cross-day fulltext search for prehled-dne → seznam.
 * Query: ?fulltext=X&offset=Y&limit=Z (fulltext must be ≥ 3 chars).
 */
export async function GET(request: NextRequest) {
  try {
    const fulltext = (request.nextUrl.searchParams.get('fulltext') ?? '').trim();
    if (fulltext.length < 3) {
      return NextResponse.json(
        { success: false, message: 'Fulltext musí mít alespoň 3 znaky.' },
        { status: 400 }
      );
    }
    const qs = new URLSearchParams({ fulltext });
    const offset = request.nextUrl.searchParams.get('offset');
    const limit = request.nextUrl.searchParams.get('limit');
    if (offset) qs.set('offset', offset);
    if (limit) qs.set('limit', limit);
    return await fetchBackend(
      `/api/admin/raynet/office-day-events/search?${qs.toString()}`,
      { method: 'GET' }
    );
  } catch (error: unknown) {
    return NextResponse.json(
      {
        success: false,
        message:
          error instanceof Error ? error.message : 'Internal server error',
      },
      { status: 500 }
    );
  }
}
