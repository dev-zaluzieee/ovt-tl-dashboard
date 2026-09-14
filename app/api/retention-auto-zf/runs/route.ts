import { NextRequest } from 'next/server';
import { fetchBackend } from '@/lib/backendFetch';

/** Automat ZF: run history. */
export async function GET(request: NextRequest) {
  const limit = request.nextUrl.searchParams.get('limit');
  const qs = limit && /^\d+$/.test(limit) ? `?limit=${limit}` : '';
  return fetchBackend(`/api/admin/retention-auto-zf/runs${qs}`, { method: 'GET' });
}
