import { NextRequest } from 'next/server';
import { fetchBackend } from '@/lib/backendFetch';

/** POST — un-hide + route to retention in one atomic call. */
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ orderId: string }> }
) {
  const { orderId } = await context.params;
  const body = await request.text();
  return fetchBackend(
    `/api/admin/tl-problematic-confirmations/${encodeURIComponent(orderId)}/undo-and-send-retence`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    }
  );
}
