import { NextRequest } from 'next/server';
import { fetchBackend } from '@/lib/backendFetch';

/** DELETE — undo the reviewed stamp for one order (does not revert shared state). */
export async function DELETE(
  _request: NextRequest,
  context: { params: Promise<{ orderId: string }> }
) {
  const { orderId } = await context.params;
  return fetchBackend(`/api/admin/tl-triage/${encodeURIComponent(orderId)}/review`, {
    method: 'DELETE',
  });
}
