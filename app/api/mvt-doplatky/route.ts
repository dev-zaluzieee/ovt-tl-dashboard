import { NextRequest } from 'next/server';
import { fetchBackend } from '@/lib/backendFetch';

/** GET Doplatky (nesedí doplatek): ?from&to&include_marked */
export async function GET(request: NextRequest) {
  const search = request.nextUrl.searchParams.toString();
  return fetchBackend(`/api/admin/mvt-doplatky${search ? `?${search}` : ''}`);
}
