import { NextRequest } from 'next/server';
import { fetchBackend } from '@/lib/backendFetch';

/** GET paginated MVT outcome submissions (Zápisy z aplikace). */
export async function GET(request: NextRequest) {
  const search = request.nextUrl.searchParams.toString();
  return fetchBackend(`/api/admin/mvt-outcomes/logs${search ? `?${search}` : ''}`);
}
