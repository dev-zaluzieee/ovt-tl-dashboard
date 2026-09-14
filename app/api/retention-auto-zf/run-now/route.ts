import { NextRequest } from 'next/server';
import { fetchBackend } from '@/lib/backendFetch';

/** Automat ZF: live run right now (admin only on the backend). */
export async function POST(_request: NextRequest) {
  return fetchBackend('/api/admin/retention-auto-zf/run-now', { method: 'POST' });
}
