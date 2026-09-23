import { NextRequest } from 'next/server';
import { fetchBackend } from '@/lib/backendFetch';

/** Recenze QR: edit or delete one QR target. */
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await request.text();
  return fetchBackend(`/api/admin/review-qr/targets/${encodeURIComponent(id)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body,
  });
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return fetchBackend(`/api/admin/review-qr/targets/${encodeURIComponent(id)}`, { method: 'DELETE' });
}
