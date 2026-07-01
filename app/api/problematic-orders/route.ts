import { NextResponse } from 'next/server';
import { fetchBackend } from '@/lib/backendFetch';

/**
 * Proxies the TL "problematic orders" list (raynet-only / no-ADMF / nezastižen)
 * over the [today-16, today-2] window. Read-only; no params.
 */
export async function GET() {
  try {
    return await fetchBackend('/api/admin/problematic-orders', {
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
