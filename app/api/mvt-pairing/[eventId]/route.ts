import { NextRequest } from 'next/server';
import { fetchBackend } from '@/lib/backendFetch';

/** POST { action: 'pair', orderId, note? } | { action: 'no-order', note? }; DELETE undoes the office decision. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  const body = (await request.json().catch(() => ({}))) as { action?: string; orderId?: number; note?: string };
  const action = body.action === 'no-order' ? 'no-order' : 'pair';
  return fetchBackend(`/api/admin/mvt-pairing/${encodeURIComponent(eventId)}/${action}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ orderId: body.orderId, note: body.note }) });
}
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  return fetchBackend(`/api/admin/mvt-pairing/${encodeURIComponent(eventId)}`, { method: 'DELETE' });
}
