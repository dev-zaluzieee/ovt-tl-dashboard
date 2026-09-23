import { NextRequest } from 'next/server';
import { fetchBackend } from '@/lib/backendFetch';

/** Recenze QR: flip the global switch ({ enabled }). Admin only on the backend. */
export async function PUT(request: NextRequest) {
  const body = await request.text();
  return fetchBackend('/api/admin/review-qr/settings', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body,
  });
}
