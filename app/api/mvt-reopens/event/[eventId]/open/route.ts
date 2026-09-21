import { NextRequest } from 'next/server';
import { fetchBackend } from '@/lib/backendFetch';

/** POST { reason } — TL opens a closed event for correction (48 h). */
export async function POST(request: NextRequest, { params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  const body = await request.text();
  return fetchBackend(`/api/admin/mvt-reopens/event/${encodeURIComponent(eventId)}/open`, { method: 'POST', body, headers: { 'Content-Type': 'application/json' } });
}
