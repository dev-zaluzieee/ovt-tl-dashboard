import { NextRequest } from 'next/server';
import { fetchBackend } from '@/lib/backendFetch';

/** Recenze QR: create a QR target ({ label, platform, url, active }). */
export async function POST(request: NextRequest) {
  const body = await request.text();
  return fetchBackend('/api/admin/review-qr/targets', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
  });
}
