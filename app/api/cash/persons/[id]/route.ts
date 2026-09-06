import { NextRequest } from 'next/server';
import { fetchBackend } from '@/lib/backendFetch';

/** GET — one person with full ledger (finance data via ceniky-2). Read-only. */
export async function GET(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  return fetchBackend(`/api/admin/cash/persons/${encodeURIComponent(id)}`, { method: 'GET' });
}
