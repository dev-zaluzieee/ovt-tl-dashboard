import { NextRequest } from 'next/server';
import { fetchBackend } from '@/lib/backendFetch';

/** Automat ZF: record a dry run (what WOULD be sent). */
export async function POST(_request: NextRequest) {
  return fetchBackend('/api/admin/retention-auto-zf/dry-run', { method: 'POST' });
}
