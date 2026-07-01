import { NextRequest } from 'next/server';
import { fetchBackend } from '@/lib/backendFetch';

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ orderId: string }> }
) {
  const { orderId } = await context.params;
  const body = await request.text();
  return fetchBackend(
    `/api/admin/orders/${encodeURIComponent(orderId)}/tl-escalate/resolve`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    }
  );
}
