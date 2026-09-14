import { NextRequest } from 'next/server';
import { fetchBackend } from '@/lib/backendFetch';

/** Automat ZF: queue one watched order for retention immediately. */
export async function POST(request: NextRequest) {
  const body = await request.text();
  return fetchBackend('/api/admin/retention-auto-zf/send-now', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
  });
}
