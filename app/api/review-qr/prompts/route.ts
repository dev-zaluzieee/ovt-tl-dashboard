import { NextRequest } from 'next/server';
import { fetchBackend } from '@/lib/backendFetch';

/** Recenze QR: prompt log + per-OVT stats (?days=&limit=). */
export async function GET(request: NextRequest) {
  const qs = request.nextUrl.searchParams.toString();
  return fetchBackend(`/api/admin/review-qr/prompts${qs ? `?${qs}` : ''}`, { method: 'GET' });
}
