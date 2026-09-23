import { fetchBackend } from '@/lib/backendFetch';

/** Recenze QR admin: global switch + QR targets + per-OVT assignments. */
export async function GET() {
  return fetchBackend('/api/admin/review-qr', { method: 'GET' });
}
