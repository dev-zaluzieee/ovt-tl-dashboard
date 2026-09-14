import { NextRequest } from 'next/server';
import { fetchBackend } from '@/lib/backendFetch';

/** Automat ZF: postpone one watched order. */
export async function POST(request: NextRequest) {
  const body = await request.text();
  return fetchBackend('/api/admin/retention-auto-zf/defer', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
  });
}
