import { NextRequest } from 'next/server';
import { fetchBackend } from '@/lib/backendFetch';

/** POST — TL confirms a single order (batch loops this per-row). */
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ orderId: string }> }
) {
  const { orderId } = await context.params;
  const body = await request.text();
  return fetchBackend(
    `/api/admin/tl-problematic-confirmations/${encodeURIComponent(orderId)}/confirm`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    }
  );
}
