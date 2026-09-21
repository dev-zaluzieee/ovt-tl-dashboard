import { fetchBackend } from '@/lib/backendFetch';

/** GET Přehled (MVT TL landing). */
export async function GET() {
  return fetchBackend('/api/admin/mvt-overview');
}
