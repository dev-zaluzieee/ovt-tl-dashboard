import { NextRequest } from 'next/server';
import { fetchBackend } from '@/lib/backendFetch';

/** PATCH — flip the B2B_28453 customField on the Raynet event. TL-only. */
export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ eventId: string }> }
) {
  const { eventId } = await context.params;
  const body = await request.text();
  return fetchBackend(
    `/api/admin/tl-raynet-events/${encodeURIComponent(eventId)}/b2b`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body,
    }
  );
}
