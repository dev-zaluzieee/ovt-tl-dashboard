import { NextRequest } from 'next/server';
import { fetchBackend } from '@/lib/backendFetch';

/** GET the MVT day view: ?date=YYYY-MM-DD */
export async function GET(request: NextRequest) {
  const search = request.nextUrl.searchParams.toString();
  return fetchBackend(`/api/admin/mvt-day${search ? `?${search}` : ''}`);
}
