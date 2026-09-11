import { NextRequest, NextResponse } from 'next/server';
import { getAuthToken, refreshSessionWithBackend } from '@/lib/backendFetch';
import { fetchCalls, type PlayerCall } from '@/lib/playerBackend';

/**
 * GET /api/customer-calls/[raynetCompanyId]?from=YYYY-MM-DD&to=YYYY-MM-DD
 *
 * Two-step lookup:
 *   1. GET /api/admin/tl-customer-phones/:id → distinct phones from local orders.
 *   2. GET player-backend /api/calls filtered by those phones + date range —
 *      the filtering happens server-side, we never pull the full call list.
 *
 * Returns { phones, calls } where calls is sorted newest-first.
 */

export const maxDuration = 60;

async function fetchPhonesFromCeniky2(
  raynetCompanyId: string
): Promise<{ phones: Array<{ normalized: string; raw: string }> }> {
  const apiUrl = process.env.API_URL || 'http://localhost:3000';
  const url = `${apiUrl}/api/admin/tl-customer-phones/${encodeURIComponent(raynetCompanyId)}/phones`;

  const call = async (token: string): Promise<Response> =>
    fetch(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
      },
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
  if (!res.ok) {
    throw new Error(`ceniky-2 /tl-customer-phones failed (${res.status})`);
  }
  const body = (await res.json()) as {
    success?: boolean;
    data?: { phones: Array<{ normalized: string; raw: string }> };
  };
  return body.data ?? { phones: [] };
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ raynetCompanyId: string }> }
) {
  const { raynetCompanyId } = await context.params;
  const url = new URL(request.url);
  const from = url.searchParams.get('from');
  const to = url.searchParams.get('to');

  try {
    const { phones } = await fetchPhonesFromCeniky2(raynetCompanyId);
    if (phones.length === 0) {
      return NextResponse.json({
        success: true,
        data: { phones: [], calls: [] as PlayerCall[] },
      });
    }
    let calls: PlayerCall[];
    try {
      calls = await fetchCalls({
        from,
        to,
        phones: phones.map((p) => p.normalized),
      });
    } catch (err) {
      // Bubble up as a soft error so the UI can distinguish "no calls" from
      // "player backend down".
      return NextResponse.json(
        {
          success: false,
          message:
            err instanceof Error
              ? err.message
              : 'Player backend nedostupný.',
        },
        { status: 502 }
      );
    }

    calls.sort((a, b) => Date.parse(b.callTime) - Date.parse(a.callTime));

    return NextResponse.json({
      success: true,
      data: { phones, calls },
    });
  } catch (err) {
    return NextResponse.json(
      {
        success: false,
        message: err instanceof Error ? err.message : 'Neočekávaná chyba.',
      },
      { status: 500 }
    );
  }
}
