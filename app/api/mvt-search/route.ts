import { NextRequest } from 'next/server';
import { fetchBackend } from '@/lib/backendFetch';

/** GET Přehled dne search: ?q= (event number, customer name or phone). */
export async function GET(request: NextRequest) {
  const search = request.nextUrl.searchParams.toString();
  return fetchBackend(`/api/admin/mvt-search${search ? `?${search}` : ''}`);
}
