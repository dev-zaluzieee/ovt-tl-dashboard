import { NextRequest, NextResponse } from 'next/server';
import { fetchBackend } from '@/lib/backendFetch';

type Ctx = { params: Promise<{ id: string }> };

/** PATCH update a team { name?, leader_user_id?, member_user_ids? }. */
export async function PATCH(request: NextRequest, { params }: Ctx) {
  try {
    const { id } = await params;
    const body = await request.json();
    return await fetchBackend(`/api/admin/teams/${encodeURIComponent(id)}`, {
      method: 'PATCH',
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

/** DELETE a team. */
export async function DELETE(_request: NextRequest, { params }: Ctx) {
  try {
    const { id } = await params;
    return await fetchBackend(`/api/admin/teams/${encodeURIComponent(id)}`, {
      method: 'DELETE',
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
