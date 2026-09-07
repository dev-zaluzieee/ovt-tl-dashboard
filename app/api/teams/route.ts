import { NextRequest, NextResponse } from 'next/server';
import { fetchBackend } from '@/lib/backendFetch';

/** GET all teams (enriched leader + members); ?workforce=ovt|mvt narrows. */
export async function GET(request: NextRequest) {
  try {
    const search = request.nextUrl.searchParams.toString();
    return await fetchBackend(`/api/admin/teams${search ? `?${search}` : ''}`, { method: 'GET' });
  } catch (error: unknown) {
    return NextResponse.json(
      {
        success: false,
        message: error instanceof Error ? error.message : 'Internal server error',
      },
      { status: 500 }
    );
  }
}

/** POST create a team { name, leader_user_id, member_user_ids? }. */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    return await fetchBackend('/api/admin/teams', {
      method: 'POST',
      body: JSON.stringify(body),
    });
  } catch (error: unknown) {
    return NextResponse.json(
      {
        success: false,
        message: error instanceof Error ? error.message : 'Internal server error',
      },
      { status: 500 }
    );
  }
}
