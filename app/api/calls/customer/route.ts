import { NextResponse, type NextRequest } from 'next/server';
import { backendFailure, backendJson, fail, recordingsFailure, requireCallsAccess } from '@/lib/calls-guard';
import { getServerSession } from '@/lib/auth-server';
import { issueCallGrant } from '@/lib/call-grant';
import { fetchCalls, type PlayerCall } from '@/lib/playerBackend';

/**
 * GET /api/calls/customer?customerId=<ERP customer id> | ?orderId=<ERP order id>&from=&to=
 * Phones of the customer and of all his orders come from the backend (`/api/tl2/calls/customer-phones`, last 9 digits
 * written once there); the recordings service is asked only after that succeeded and only for those phones.
 * `q` (optional) is the search text that found the customer outside the dashboard's scope: it is forwarded unchanged so the
 * backend can apply its scope rule. Every returned call carries a `grant` that play / analysis require (lib/call-grant.ts).
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const ID_RE = /^[1-9][0-9]{0,15}$/;
const Q_RE = /^[^\u0000-\u001f]{3,100}$/;

export async function GET(request: NextRequest) {
  const access = await requireCallsAccess(request);
  if (!access.ok) return access.response;
  const sp = request.nextUrl.searchParams;
  const customerId = sp.get('customerId');
  const orderId = sp.get('orderId');
  const from = sp.get('from');
  const to = sp.get('to');
  const q = sp.get('q');
  if (q !== null && !Q_RE.test(q)) return fail(400, 'Hledaný text musí mít 3 až 100 znaků.', 'INVALID_QUERY');
  if ((from && !DATE_RE.test(from)) || (to && !DATE_RE.test(to))) return fail(400, 'Neplatné datum.', 'INVALID_DATE');
  if ((customerId ? 1 : 0) + (orderId ? 1 : 0) !== 1 || (customerId && !ID_RE.test(customerId)) || (orderId && !ID_RE.test(orderId))) return fail(400, 'Zadejte ID zákazníka nebo zakázky.', 'INVALID_ID');

  const { status, json } = await backendJson(access.token, 'GET', 'calls/customer-phones', undefined, { ...(customerId ? { customerId } : { orderId: orderId as string }), ...(q ? { q } : {}) }).catch(() => ({ status: 503, json: { code: 'BACKEND_UNREACHABLE', message: 'Server je dočasně nedostupný, zkuste to prosím za chvíli.' } as Record<string, unknown> }));
  if (status !== 200 || json.success !== true) return backendFailure(status, json);
  const info = json.data as { phones?: Array<{ key: string }> } & Record<string, unknown>;
  const keys = [...new Set((info.phones ?? []).map((p) => p.key))];

  let calls: PlayerCall[] = [];
  if (keys.length > 0) {
    try {
      calls = await fetchCalls({ from, to, phones: keys });
    } catch (e) {
      return recordingsFailure(e);
    }
    calls.sort((a, b) => Date.parse(b.callTime) - Date.parse(a.callTime));
  }
  const email = (await getServerSession())?.user.email ?? null;
  const granted = email ? calls.map((c) => ({ ...c, grant: issueCallGrant(email, c.id) })) : [];
  return NextResponse.json({ success: true, data: { ...info, calls: granted } }, { headers: { 'Cache-Control': 'no-store' } });
}
