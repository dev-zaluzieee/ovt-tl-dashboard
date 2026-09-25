import { NextRequest } from 'next/server';
import { fetchBackend } from '@/lib/backendFetch';

/** Recenze QR: QR of one region and audience ({ regionKey, audience: 'b2c' | 'b2b', targetId | null }). */
export async function PUT(request: NextRequest) {
  const body = await request.text();
  return fetchBackend('/api/admin/review-qr/regions', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body,
  });
}
