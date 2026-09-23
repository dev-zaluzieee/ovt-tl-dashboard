import { NextRequest } from 'next/server';
import { fetchBackend } from '@/lib/backendFetch';

/** Recenze QR: assign a target to an OVT ({ ovtEmail, targetId | null }). */
export async function PUT(request: NextRequest) {
  const body = await request.text();
  return fetchBackend('/api/admin/review-qr/assignments', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body,
  });
}
