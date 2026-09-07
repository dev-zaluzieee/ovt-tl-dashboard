import { NextRequest } from 'next/server';
import { fetchBackend } from '@/lib/backendFetch';

export async function GET(request: NextRequest) {
  const search = request.nextUrl.searchParams.toString();
  return fetchBackend(`/api/admin/mvt-outcomes/filter-options${search ? `?${search}` : ''}`);
}
