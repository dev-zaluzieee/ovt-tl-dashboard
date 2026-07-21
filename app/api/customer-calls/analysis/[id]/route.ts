import { NextResponse } from 'next/server';
import { fetchCallAnalysis, triggerCallAnalysis } from '@/lib/playerBackend';

/**
 * GET  /api/customer-calls/analysis/[id]  — current transcript/summary/sentiment status.
 * POST /api/customer-calls/analysis/[id]  — trigger (or re-check) processing.
 * Player backend enforces access + queue scope ("Příjem zakázek" only) — this
 * route just proxies through with the service account JWT.
 */
export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  try {
    const data = await fetchCallAnalysis(id);
    return NextResponse.json({ success: true, data });
  } catch (err) {
    return NextResponse.json(
      {
        success: false,
        message: err instanceof Error ? err.message : 'Nepodařilo se načíst analýzu.',
      },
      { status: 502 }
    );
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  const force = new URL(request.url).searchParams.get('force') === 'true';
  try {
    const data = await triggerCallAnalysis(id, force);
    return NextResponse.json({ success: true, data });
  } catch (err) {
    return NextResponse.json(
      {
        success: false,
        message: err instanceof Error ? err.message : 'Nepodařilo se spustit analýzu.',
      },
      { status: 502 }
    );
  }
}
