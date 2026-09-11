import { NextRequest, NextResponse } from 'next/server';
import { getAuthToken, refreshSessionWithBackend } from '@/lib/backendFetch';
import { fetchCallPhoneSummary } from '@/lib/playerBackend';

/**
 * GET /api/orders-with-calls?from=YYYY-MM-DD&to=YYYY-MM-DD
 *
 * Landing list: every local order whose phone has at least one matching
 * Daktela call (loose 9-digit match). Optional date range clamps which calls
 * count toward the intersection.
 *
 * Flow:
 *   1. Fetch the per-phone call summary from player-backend (date range is
 *      applied server-side — never pull the raw call list, it's tens of MB).
 *   2. POST the phone keys to ceniky-2 → orders whose phone matches ANY key.
 *   3. Join: attach per-order call count + latest callTime to each row.
 */

// Player-backend aggregates over the whole range; give the roundtrip room.
export const maxDuration = 60;

interface BackendOrder {
  id: number;
  raynet_id: number | null;
  name: string | null;
  phone: string | null;
  phone_key: string;
  user_id: string | null;
  source_erp_order_id: number | null;
  created_at: string;
}

async function postToCeniky2(
  path: string,
  bodyObj: unknown
): Promise<Response> {
  const apiUrl = process.env.API_URL || 'http://localhost:3000';
  const url = `${apiUrl}${path}`;
  const call = async (t: string): Promise<Response> =>
    fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${t}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(bodyObj),
    });
  let token = await getAuthToken();
  if (!token) throw new Error('Not authenticated');
  let res = await call(token);
  if (res.status === 401) {
    const refreshed = await refreshSessionWithBackend();
    if (refreshed) {
      token = await getAuthToken();
      if (token) res = await call(token);
    }
  }
  return res;
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const from = url.searchParams.get('from');
  const to = url.searchParams.get('to');

  try {
    // 1. Per-phone aggregate from player backend (date clamp applied there).
    const summary = await fetchCallPhoneSummary({ from, to });
    const perKey = new Map(
      summary.map((s) => [
        s.phoneKey,
        {
          count: s.callCount,
          lastCallTime: s.lastCallTime,
          agents: s.agents,
        },
      ])
    );

    if (perKey.size === 0) {
      return NextResponse.json({
        success: true,
        data: { orders: [] },
      });
    }

    // 2. Lookup orders matching those keys via ceniky-2.
    const res = await postToCeniky2('/api/admin/tl-orders-with-calls/lookup', {
      phoneKeys: [...perKey.keys()],
    });
    if (!res.ok) {
      return NextResponse.json(
        { success: false, message: `Backend lookup failed (${res.status}).` },
        { status: 502 }
      );
    }
    const body = (await res.json()) as {
      success?: boolean;
      data?: { orders: BackendOrder[] };
    };
    const orders = body.data?.orders ?? [];

    // 3. Join with per-key stats. Return enriched rows.
    const enriched = orders.map((o) => {
      const stats = perKey.get(o.phone_key);
      return {
        ...o,
        call_count: stats?.count ?? 0,
        last_call_time: stats?.lastCallTime ?? null,
        agents: stats?.agents ?? [],
      };
    });
    // Newest calls first (fall back to created_at).
    enriched.sort((a, b) => {
      const ta = a.last_call_time ? Date.parse(a.last_call_time) : 0;
      const tb = b.last_call_time ? Date.parse(b.last_call_time) : 0;
      return tb - ta;
    });

    return NextResponse.json({
      success: true,
      data: { orders: enriched },
    });
  } catch (err) {
    return NextResponse.json(
      {
        success: false,
        message: err instanceof Error ? err.message : 'Neočekávaná chyba.',
      },
      { status: 502 }
    );
  }
}
