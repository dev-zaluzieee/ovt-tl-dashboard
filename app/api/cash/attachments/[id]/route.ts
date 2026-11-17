import { fail } from '@/lib/bff-proxy';
import { isCashId } from '@/lib/cash-routes';
import { financeFile } from '@/lib/finance-proxy';

/** Receipt of any person: finance `GET /api/tl/cash/attachments/:id`, streamed back (image or PDF), read-only. */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!isCashId(id)) return fail(400, 'Neplatné id přílohy.', 'INVALID_ID');
  return financeFile(`attachments/${id}`);
}
