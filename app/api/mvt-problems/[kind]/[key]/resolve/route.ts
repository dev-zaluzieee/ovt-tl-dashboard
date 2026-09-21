import { NextRequest } from 'next/server';
import { fetchBackend } from '@/lib/backendFetch';

/** POST { reason, note? } resolves a problem item; DELETE reopens it. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ kind: string; key: string }> }) {
  const { kind, key } = await params;
  const body = await request.text();
  return fetchBackend(`/api/admin/mvt-problems/${encodeURIComponent(kind)}/${encodeURIComponent(key)}/resolve`, { method: 'POST', body, headers: { 'Content-Type': 'application/json' } });
}
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ kind: string; key: string }> }) {
  const { kind, key } = await params;
  return fetchBackend(`/api/admin/mvt-problems/${encodeURIComponent(kind)}/${encodeURIComponent(key)}/resolve`, { method: 'DELETE' });
}
