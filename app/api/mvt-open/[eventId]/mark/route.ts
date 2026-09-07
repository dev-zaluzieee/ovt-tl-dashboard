import { NextRequest } from 'next/server';
import { fetchBackend } from '@/lib/backendFetch';

/** POST { note? } marks the event handled; DELETE removes the mark. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  const body = await request.text();
  return fetchBackend(`/api/admin/mvt-open/${encodeURIComponent(eventId)}/mark`, { method: 'POST', body, headers: { 'Content-Type': 'application/json' } });
}
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  return fetchBackend(`/api/admin/mvt-open/${encodeURIComponent(eventId)}/mark`, { method: 'DELETE' });
}
