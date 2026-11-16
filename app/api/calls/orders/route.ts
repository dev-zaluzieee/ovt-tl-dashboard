import { NextResponse, type NextRequest } from 'next/server';
import { backendFailure, backendJson, fail, recordingsFailure, requireCallsAccess } from '@/lib/calls-guard';
import { fetchCallPhoneSummary } from '@/lib/playerBackend';

/**
 * GET /api/calls/orders?from=YYYY-MM-DD&to=YYYY-MM-DD
 * Orders of the dashboard's universe whose phones have recorded calls. Session and backend are checked FIRST; then the
 * per-phone summary comes from the recordings service, its phone keys (last 9 digits) go to the backend
 * (`POST /api/tl2/calls/lookup`), and the answer is joined here by key.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(request: NextRequest) {
  const access = await requireCallsAccess(request);
  if (!access.ok) return access.response;
  const from = request.nextUrl.searchParams.get('from');
  const to = request.nextUrl.searchParams.get('to');
  if ((from && !DATE_RE.test(from)) || (to && !DATE_RE.test(to))) return fail(400, 'Neplatné datum.', 'INVALID_DATE');

  let summary;
  try {
    summary = await fetchCallPhoneSummary({ from, to });
  } catch (e) {
    return recordingsFailure(e);
  }
  const perKey = new Map<string, { count: number; last: string; agents: string[] }>();
  for (const s of summary) {
    if (/^\d{6,9}$/.test(s.phoneKey)) perKey.set(s.phoneKey, { count: s.callCount, last: s.lastCallTime, agents: s.agents ?? [] });
  }
  if (perKey.size === 0) return NextResponse.json({ success: true, data: { orders: [], truncated: false } }, { headers: { 'Cache-Control': 'no-store' } });

  const keys = [...perKey.keys()].slice(0, 20_000);
  const { status, json } = await backendJson(access.token, 'POST', 'calls/lookup', { phoneKeys: keys }).catch(() => ({ status: 503, json: { code: 'BACKEND_UNREACHABLE', message: 'Server je dočasně nedostupný, zkuste to prosím za chvíli.' } as Record<string, unknown> }));
  if (status !== 200 || json.success !== true) return backendFailure(status, json);
  const data = (json.data ?? {}) as { orders?: Array<{ phones?: Array<{ key: string }> } & Record<string, unknown>>; truncated?: boolean };

  const orders = (data.orders ?? [])
    .map((o) => {
      const seen = new Set<string>();
      let count = 0;
      let last: string | null = null;
      const agents = new Set<string>();
      for (const p of o.phones ?? []) {
        if (seen.has(p.key)) continue;
        seen.add(p.key);
        const s = perKey.get(p.key);
        if (!s) continue;
        count += s.count;
        if (!last || Date.parse(s.last) > Date.parse(last)) last = s.last;
        for (const a of s.agents) agents.add(a);
      }
      return { ...o, callCount: count, lastCallTime: last, agents: [...agents] };
    })
    .filter((o) => o.callCount > 0)
    .sort((a, b) => (b.lastCallTime ? Date.parse(b.lastCallTime) : 0) - (a.lastCallTime ? Date.parse(a.lastCallTime) : 0));

  return NextResponse.json({ success: true, data: { orders, truncated: data.truncated === true } }, { headers: { 'Cache-Control': 'no-store' } });
}
