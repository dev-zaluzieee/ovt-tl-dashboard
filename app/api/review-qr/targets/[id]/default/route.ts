import { NextRequest } from 'next/server';
import { fetchBackend } from '@/lib/backendFetch';

/** Recenze QR: make a target the default for OVTs without an assignment ({ isDefault }). */
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await request.text();
  return fetchBackend(`/api/admin/review-qr/targets/${encodeURIComponent(id)}/default`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body,
  });
}
