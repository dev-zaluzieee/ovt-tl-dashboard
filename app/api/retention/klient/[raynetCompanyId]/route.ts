import { NextRequest } from 'next/server';
import { fetchBackend } from '@/lib/backendFetch';

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ raynetCompanyId: string }> }
) {
  const { raynetCompanyId } = await context.params;
  return fetchBackend(
    `/api/admin/retention/klient/${encodeURIComponent(raynetCompanyId)}`
  );
}
