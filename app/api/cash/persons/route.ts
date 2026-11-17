import { financeJson } from '@/lib/finance-proxy';

/** Overview of persons with balances: finance `GET /api/tl/cash/persons`, read-only. */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  return financeJson('persons');
}
