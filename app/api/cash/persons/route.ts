import { NextResponse } from 'next/server';
import { fetchBackend } from '@/lib/backendFetch';

/** GET — all persons with cash balances (finance data via ceniky-2). Read-only. */
export async function GET() {
  try {
    return await fetchBackend('/api/admin/cash/persons', { method: 'GET' });
  } catch (error: unknown) {
    return NextResponse.json(
      { success: false, message: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
