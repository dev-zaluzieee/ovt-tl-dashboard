import { NextRequest } from 'next/server';
import { fetchBackend } from '@/lib/backendFetch';

/** GET Nedokončené montáže: ?from&to */
export async function GET(request: NextRequest) {
  const search = request.nextUrl.searchParams.toString();
  return fetchBackend(`/api/admin/mvt-open${search ? `?${search}` : ''}`);
}
