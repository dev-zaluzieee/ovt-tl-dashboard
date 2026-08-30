import { NextRequest } from 'next/server';
import { fetchBackend } from '@/lib/backendFetch';

/** POST — apply a triage disposition to one order. */
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ orderId: string }> }
) {
  const { orderId } = await context.params;
  const body = await request.text();
  return fetchBackend(
    `/api/admin/tl-triage/${encodeURIComponent(orderId)}/disposition`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body }
  );
}
