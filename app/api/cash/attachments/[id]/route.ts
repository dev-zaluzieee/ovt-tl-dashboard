import { NextRequest, NextResponse } from 'next/server';
import { getAuthToken } from '@/lib/backendFetch';

/**
 * GET — receipt bytes (image/PDF). fetchBackend only handles JSON, so this
 * streams the upstream body through with its content headers.
 */
export async function GET(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const token = await getAuthToken();
  if (!token) return NextResponse.json({ success: false, message: 'Not authenticated' }, { status: 401 });
  const apiUrl = process.env.API_URL || 'http://localhost:3000';
  const upstream = await fetch(`${apiUrl}/api/admin/cash/attachments/${encodeURIComponent(id)}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!upstream.ok) {
    return NextResponse.json(
      { success: false, message: `Přílohu se nepodařilo načíst (${upstream.status})` },
      { status: upstream.status }
    );
  }
  const headers = new Headers();
  headers.set('Content-Type', upstream.headers.get('content-type') ?? 'application/octet-stream');
  const disposition = upstream.headers.get('content-disposition');
  if (disposition) headers.set('Content-Disposition', disposition);
  headers.set('Cache-Control', 'private, max-age=300');
  return new Response(upstream.body, { status: 200, headers });
}
