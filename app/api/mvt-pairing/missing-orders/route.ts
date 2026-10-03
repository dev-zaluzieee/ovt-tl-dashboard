import { NextRequest } from 'next/server';
import { fetchBackend } from '@/lib/backendFetch';

/** GET "K založení": upcoming montáže with no local order anywhere (?days=14&refresh=1). */
export async function GET(request: NextRequest) {
  const search = request.nextUrl.searchParams.toString();
  return fetchBackend(`/api/admin/mvt-pairing/missing-orders${search ? `?${search}` : ''}`);
}
