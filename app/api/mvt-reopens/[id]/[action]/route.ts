import { NextRequest } from 'next/server';
import { fetchBackend } from '@/lib/backendFetch';

/** POST approve | decline | cancel on a reopen. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string; action: string }> }) {
  const { id, action } = await params;
  if (!['approve', 'decline', 'cancel'].includes(action)) return new Response(JSON.stringify({ success: false, error: 'Neznámá akce.' }), { status: 400 });
  const body = await request.text();
  return fetchBackend(`/api/admin/mvt-reopens/${encodeURIComponent(id)}/${action}`, { method: 'POST', body, headers: { 'Content-Type': 'application/json' } });
}
