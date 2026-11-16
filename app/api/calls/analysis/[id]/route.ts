import { NextResponse, type NextRequest } from 'next/server';
import { fail, recordingsFailure, requireCallsAccess } from '@/lib/calls-guard';
import { fetchCallAnalysis, triggerCallAnalysis } from '@/lib/playerBackend';

/**
 * GET  /api/calls/analysis/[id]: transcript / summary / sentiment status.
 * POST /api/calls/analysis/[id]: start (or re-check) the processing; `?force=true` re-runs it.
 * The old app let both through without a session; here the session and the backend are checked first.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const access = await requireCallsAccess(request);
  if (!access.ok) return access.response;
  const { id } = await context.params;
  if (!ID_RE.test(id)) return fail(400, 'Neplatné ID hovoru.', 'INVALID_ID');
  try {
    return NextResponse.json({ success: true, data: await fetchCallAnalysis(id) }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    return recordingsFailure(e);
  }
}

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const access = await requireCallsAccess(request, { write: true });
  if (!access.ok) return access.response;
  const { id } = await context.params;
  if (!ID_RE.test(id)) return fail(400, 'Neplatné ID hovoru.', 'INVALID_ID');
  try {
    return NextResponse.json({ success: true, data: await triggerCallAnalysis(id, request.nextUrl.searchParams.get('force') === 'true') }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    return recordingsFailure(e);
  }
}
