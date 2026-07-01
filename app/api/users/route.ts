import { NextResponse } from 'next/server';
import { fetchBackend } from '@/lib/backendFetch';

/** Proxies the staff user list (enriched with is_ovt_tl / raynet_id) for team pickers. */
export async function GET() {
  try {
    return await fetchBackend('/api/admin/users', { method: 'GET' });
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
