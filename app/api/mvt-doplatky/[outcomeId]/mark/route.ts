import { NextRequest } from 'next/server';
import { fetchBackend } from '@/lib/backendFetch';

/** POST { note? } marks the outcome handled on the Doplatky view; DELETE removes the mark. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ outcomeId: string }> }) {
  const { outcomeId } = await params;
  const body = await request.text();
  return fetchBackend(`/api/admin/mvt-doplatky/${encodeURIComponent(outcomeId)}/mark`, { method: 'POST', body, headers: { 'Content-Type': 'application/json' } });
}
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ outcomeId: string }> }) {
  const { outcomeId } = await params;
  return fetchBackend(`/api/admin/mvt-doplatky/${encodeURIComponent(outcomeId)}/mark`, { method: 'DELETE' });
}
