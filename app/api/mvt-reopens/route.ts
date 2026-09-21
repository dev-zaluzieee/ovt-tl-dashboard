import { NextRequest } from 'next/server';
import { fetchBackend } from '@/lib/backendFetch';

/** GET reopens ("Otevřít k opravě"): ?include_finished */
export async function GET(request: NextRequest) {
  const search = request.nextUrl.searchParams.toString();
  return fetchBackend(`/api/admin/mvt-reopens${search ? `?${search}` : ''}`);
}
