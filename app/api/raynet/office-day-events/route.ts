import { NextRequest, NextResponse } from 'next/server';
import { fetchBackend } from '@/lib/backendFetch';

/**
 * Proxies staff office-day Raynet aggregation (all paired users for one calendar date).
 */
export async function GET(request: NextRequest) {
  try {
    const date = request.nextUrl.searchParams.get('date');
    if (!date) {
      return NextResponse.json(
        { success: false, message: 'Missing date query (YYYY-MM-DD)' },
        { status: 400 }
      );
    }
    const qs = new URLSearchParams({ date });
    const person = request.nextUrl.searchParams.get('person');
    if (person != null && person.trim() !== '') {
      qs.set('person', person.trim());
    }
    return await fetchBackend(`/api/admin/raynet/office-day-events?${qs.toString()}`, {
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
