import { NextResponse } from 'next/server';
import { getFinanceUrl } from '@/lib/finance-url';

/** Whether Hotovost is set up on this server (`FINANCE_API_URL`); the navigation shows it. Behind the access gate (session). */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json({ success: true, data: { configured: getFinanceUrl() !== null } }, { headers: { 'Cache-Control': 'no-store' } });
}
