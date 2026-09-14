import { NextRequest } from 'next/server';
import { fetchBackend } from '@/lib/backendFetch';

/** Automat ZF: next run, last live run, live preview snapshot, deferrals. */
export async function GET(_request: NextRequest) {
  return fetchBackend('/api/admin/retention-auto-zf/status', { method: 'GET' });
}
