import { NextRequest } from 'next/server';
import { fetchBackend } from '@/lib/backendFetch';

/** GET montéři from the mvt-mapa registry (via ceniky-2, read-only). Query: active=true */
export async function GET(request: NextRequest) {
  const search = request.nextUrl.searchParams.toString();
  return fetchBackend(`/api/admin/mvt-registry${search ? `?${search}` : ''}`);
}
