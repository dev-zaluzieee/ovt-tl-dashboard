import { NextResponse, type NextRequest } from 'next/server';
import { fail, recordingsFailure, requireCallGrant, requireCallsAccess } from '@/lib/calls-guard';
import { fetchCallPlayUrl } from '@/lib/playerBackend';

/** GET /api/calls/play/[id]: short-lived presigned URL of a recording. Session and backend are checked first. */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const access = await requireCallsAccess(request);
  if (!access.ok) return access.response;
  const { id } = await context.params;
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(id)) return fail(400, 'Neplatné ID hovoru.', 'INVALID_ID');
  const denied = await requireCallGrant(request, id);
  if (denied) return denied;
  try {
    return NextResponse.json({ success: true, data: { url: await fetchCallPlayUrl(id) } }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    return recordingsFailure(e);
  }
}
