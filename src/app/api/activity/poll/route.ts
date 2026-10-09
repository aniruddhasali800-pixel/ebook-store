import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSessionPayload } from '@/lib/auth/session';
import { activitySince, activeVisitors } from '@/lib/activity';

/**
 * The dashboard's catch-up call: everything the queue has gained since the last
 * time this page looked, plus who is on the site right now.
 *
 * Polled rather than streamed. A serverless runtime cannot hold one connection
 * open for a shift — the function would be billed for idling, cut off at its own
 * timeout, and still only know about events published on that instance. Asking
 * the database every few seconds is the same result with a shorter list of ways
 * to be wrong, and it means a second dashboard tab, or a second machine, sees the
 * identical queue.
 */
export const dynamic = 'force-dynamic';

const POLL_INTERVAL_MS = 4_000;

export async function GET(request: Request) {
  const payload = await getSessionPayload();
  if (!payload) {
    return NextResponse.json({ error: 'unauthorised' }, { status: 401, headers: { 'cache-control': 'no-store' } });
  }
  const user = await prisma.user.findUnique({ where: { id: payload.userId }, select: { id: true, role: true } });
  if (!user || (user.role !== 'ADMIN' && user.role !== 'CASHIER')) {
    return NextResponse.json({ error: 'unauthorised' }, { status: 401, headers: { 'cache-control': 'no-store' } });
  }

  const since = Number(new URL(request.url).searchParams.get('since') ?? '0');
  // A cursor is only a promise about the past, so a wild value must not be able to
  // ask for the whole table.
  const cursor = Number.isInteger(since) && since >= 0 ? Math.min(since, Number.MAX_SAFE_INTEGER) : 0;

  const [events, visitors] = await Promise.all([activitySince(cursor), activeVisitors()]);
  return NextResponse.json(
    { events, visitors: visitors.count, pollMs: POLL_INTERVAL_MS },
    { headers: { 'cache-control': 'no-store' } },
  );
}
