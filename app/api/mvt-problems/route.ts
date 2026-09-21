import { NextRequest } from 'next/server';
import { fetchBackend } from '@/lib/backendFetch';

/** GET Problematické zakázky (MVT): ?from&to&include_resolved */
export async function GET(request: NextRequest) {
  const search = request.nextUrl.searchParams.toString();
  return fetchBackend(`/api/admin/mvt-problems${search ? `?${search}` : ''}`);
}
