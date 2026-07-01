import { NextResponse } from 'next/server';
import { fetchCallPlayUrl } from '@/lib/playerBackend';

/**
 * GET /api/customer-calls/play/[id]
 * Returns { url } — presigned S3 URL from the player backend. Frontend puts
 * it straight into <audio src>. Short-lived (default 900 s), don't cache.
 */
export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  try {
    const url = await fetchCallPlayUrl(id);
    return NextResponse.json({ success: true, data: { url } });
  } catch (err) {
    return NextResponse.json(
      {
        success: false,
        message: err instanceof Error ? err.message : 'Nepodařilo se získat URL.',
      },
      { status: 502 }
    );
  }
}
