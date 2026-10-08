import { NextRequest } from 'next/server';
import { fetchBackend } from '@/lib/backendFetch';

/** GET Záchrany — „dokončeno se záchranou" včetně textu: ?from&to */
export async function GET(request: NextRequest) {
  const search = request.nextUrl.searchParams.toString();
  return fetchBackend(`/api/admin/mvt-zachrany${search ? `?${search}` : ''}`);
}
