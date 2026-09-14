import { NextRequest, NextResponse } from 'next/server';
import { fetchBackend } from '@/lib/backendFetch';

/** Automat ZF: cancel a deferral. */
export async function DELETE(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  if (!/^\d+$/.test(id)) {
    return NextResponse.json({ success: false, message: 'Neplatné ID odložení' }, { status: 400 });
  }
  return fetchBackend(`/api/admin/retention-auto-zf/defer/${id}`, { method: 'DELETE' });
}
