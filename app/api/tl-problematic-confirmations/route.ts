import { NextResponse } from 'next/server';
import { fetchBackend } from '@/lib/backendFetch';

/** GET — enriched list of all TL-confirmed orders for /skryte-zakazky. */
export async function GET() {
  try {
    return await fetchBackend('/api/admin/tl-problematic-confirmations', {
      method: 'GET',
    });
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
