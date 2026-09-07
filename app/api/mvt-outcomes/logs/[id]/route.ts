import { NextRequest } from 'next/server';
import { fetchBackend } from '@/lib/backendFetch';

/** GET one MVT outcome with steps + attachments. */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return fetchBackend(`/api/admin/mvt-outcomes/logs/${encodeURIComponent(id)}`);
}
