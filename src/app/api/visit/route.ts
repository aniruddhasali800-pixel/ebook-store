import { NextResponse } from 'next/server';
import { recordVisit } from '@/lib/activity';

/**
 * The page-view beacon every customer page pings.
 *
 * It carries an id the browser made up for this tab and nothing else: no cookie,
 * no IP, no fingerprint. What the shop gets is "somebody is on /cafe right now",
 * which is the only question the dashboard asks.
 */
export async function POST(request: Request) {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const body = (payload ?? {}) as { visitorId?: unknown; page?: unknown };
  const result = await recordVisit({
    visitorId: typeof body.visitorId === 'string' ? body.visitorId : undefined,
    page: typeof body.page === 'string' ? body.page : '/',
  });

  return NextResponse.json(
    { ok: true, counted: result.isNew, activeNow: result.activeNow },
    { headers: { 'cache-control': 'no-store' } },
  );
}
