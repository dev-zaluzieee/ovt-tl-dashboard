import { NextRequest, NextResponse } from 'next/server';
import { fetchBackend } from '@/lib/backendFetch';

/** Automat ZF: one run with per-order results. */
export async function GET(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  if (!/^\d+$/.test(id)) {
    return NextResponse.json({ success: false, message: 'Neplatné ID běhu' }, { status: 400 });
  }
  return fetchBackend(`/api/admin/retention-auto-zf/runs/${id}`, { method: 'GET' });
}
