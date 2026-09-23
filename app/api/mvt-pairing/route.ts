import { NextRequest } from 'next/server';
import { fetchBackend } from '@/lib/backendFetch';

/** GET Párování: ?date=YYYY-MM-DD (one day per call, by design). */
export async function GET(request: NextRequest) {
  const search = request.nextUrl.searchParams.toString();
  return fetchBackend(`/api/admin/mvt-pairing${search ? `?${search}` : ''}`);
}
