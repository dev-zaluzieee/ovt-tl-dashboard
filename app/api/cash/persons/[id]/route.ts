import { fail } from '@/lib/bff-proxy';
import { isCashId } from '@/lib/cash-routes';
import { financeJson } from '@/lib/finance-proxy';

/** One person: finance `GET /api/tl/cash/persons/:id` (summary, ledger, missing proof), read-only. */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!isCashId(id)) return fail(400, 'Neplatné ID osoby.', 'INVALID_ID');
  return financeJson(`persons/${id}`);
}
