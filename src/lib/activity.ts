import 'server-only';
import { prisma } from '@/lib/db';

/**
 * What is happening on the site right now, for the shop's own dashboards.
 *
 * This used to be process memory with a note that it would have to move before a
 * second instance was ever started. On a hosted runtime there is no single process
 * to be the truth: the request that marks a payment settled may run on a different
 * machine from the one holding the dashboard's connection, so the queue lives in
 * the database and a dashboard asks it for whatever happened since its last look.
 *
 * What is still deliberately short-lived: a visitor is a page and a timestamp for
 * ninety seconds, then the row goes. Nothing here stores an IP address, a user
 * agent or a cross-visit profile — the question the dashboard asks is "is anyone
 * here now", not "who was here in March". The event queue holds the same headlines
 * a staff member would already see on the order, refund and complaint screens; it
 * is a nudge, not a second copy of the paperwork, and rows older than a few days
 * are trimmed.
 */

export const PRESENCE_WINDOW_MS = 90_000;
const FEED_RETENTION_MS = 3 * 24 * 60 * 60 * 1000;
const FEED_CAP = 500;
const TRIM_EVERY_MS = 10 * 60 * 1000;

export type ActivityEvent = {
  /** Ascending database id — a dashboard's cursor into the queue. */
  id: number;
  /** arrival | order | claim | settled | payment | refund | complaint | book | stock */
  type: string;
  /** CAFE or BOOKS, or null for an event about the site as a whole. */
  channel?: string | null;
  headline: string;
  detail?: string | null;
  href?: string | null;
  at: number;
};

type NewEvent = {
  type: string;
  channel?: string | null;
  headline: string;
  detail?: string | null;
  href?: string | null;
};

function toEvent(row: {
  id: number;
  type: string;
  channel: string | null;
  headline: string;
  detail: string | null;
  href: string | null;
  createdAt: Date;
}): ActivityEvent {
  return {
    id: row.id,
    type: row.type,
    channel: row.channel,
    headline: row.headline,
    detail: row.detail,
    href: row.href,
    at: row.createdAt.getTime(),
  };
}

/**
 * Add a dashboard alert — an order, a payment claim, a refund request.
 *
 * Awaiting this on the money path is safe by design: a failed write is logged and
 * swallowed, because a payment that really arrived must never be reported as
 * failed just because its notification could not be stored.
 */
export async function publishActivity(event: NewEvent): Promise<void> {
  try {
    await prisma.activityEntry.create({
      data: {
        type: event.type,
        channel: event.channel ?? null,
        headline: event.headline.slice(0, 200),
        detail: event.detail ? event.detail.slice(0, 300) : null,
        href: event.href ? event.href.slice(0, 120) : null,
      },
    });
  } catch (error) {
    console.error(`[activity] could not record a ${event.type} event`, error);
    return;
  }
  void trimFeed();
}

/** The newest events first — what a dashboard page shows when it opens. */
export async function activityFeed(limit = 20): Promise<ActivityEvent[]> {
  const rows = await prisma.activityEntry.findMany({ orderBy: { id: 'desc' }, take: limit });
  return rows.map(toEvent);
}

/**
 * Everything after `since`, oldest first, so a dashboard can catch up on whatever
 * happened while it was looking away. An id from the future (a database restored
 * from backup, a stale tab) simply means nothing new.
 */
export async function activitySince(since: number, limit = 25): Promise<ActivityEvent[]> {
  if (!Number.isInteger(since) || since < 0) return [];
  const rows = await prisma.activityEntry.findMany({
    where: { id: { gt: since } },
    orderBy: { id: 'asc' },
    take: limit,
  });
  return rows.map(toEvent);
}

/**
 * A page view from a customer. Returns whether this counts as them arriving, so
 * the dashboard is told once per visit rather than once per navigation.
 */
export async function recordVisit(input: {
  visitorId?: string;
  page?: string;
}): Promise<{ isNew: boolean; activeNow: number }> {
  const page = safePage(input.page);
  const key = normaliseVisitorId(input.visitorId);
  const cutoff = new Date(Date.now() - PRESENCE_WINDOW_MS);

  if (!key) return { isNew: false, activeNow: await prisma.visitorSlot.count({ where: { lastSeenAt: { gte: cutoff } } }) };

  const seen = await prisma.visitorSlot.findUnique({ where: { key }, select: { lastSeenAt: true } });
  const isNew = !seen || seen.lastSeenAt < cutoff;
  await prisma.visitorSlot.upsert({
    where: { key },
    update: { page, lastSeenAt: new Date() },
    create: { key, page },
  });

  const activeNow = await prisma.visitorSlot.count({ where: { lastSeenAt: { gte: cutoff } } });
  if (isNew) {
    await publishActivity({ type: 'arrival', headline: 'A customer arrived', detail: page, href: page });
  }
  void trimVisitors();
  return { isNew, activeNow };
}

/** Who is on the site at this moment, and where. */
export async function activeVisitors(): Promise<{ count: number; pages: { page: string; secondsAgo: number }[] }> {
  const now = Date.now();
  const cutoff = new Date(now - PRESENCE_WINDOW_MS);
  const rows = await prisma.visitorSlot.findMany({
    where: { lastSeenAt: { gte: cutoff } },
    orderBy: { lastSeenAt: 'desc' },
    take: 8,
  });
  const count = await prisma.visitorSlot.count({ where: { lastSeenAt: { gte: cutoff } } });
  return {
    count,
    pages: rows.map((row) => ({ page: row.page, secondsAgo: Math.round((now - row.lastSeenAt.getTime()) / 1000) })),
  };
}

let lastSweepAt = 0;

/**
 * The queue is a nudge, not an archive, and the presence rows are a head count,
 * not a log. Both sweeps share one clock, run on the same writes that create them,
 * and are never waited on: being a few minutes late costs nothing.
 */
async function trimFeed(): Promise<void> {
  const now = Date.now();
  if (now - lastSweepAt < TRIM_EVERY_MS) return;
  lastSweepAt = now;
  try {
    const newest = await prisma.activityEntry.aggregate({ _max: { id: true } });
    const floor = (newest._max.id ?? 0) - FEED_CAP;
    const tooOld = { createdAt: { lt: new Date(now - FEED_RETENTION_MS) } };
    await prisma.activityEntry.deleteMany({
      where: floor > 0 ? { OR: [{ id: { lte: floor } }, tooOld] } : tooOld,
    });
  } catch (error) {
    console.error('[activity] the feed trim failed; the queue is simply longer than intended', error);
  }
}

async function trimVisitors(): Promise<void> {
  const now = Date.now();
  if (now - lastSweepAt < TRIM_EVERY_MS) return;
  try {
    await prisma.visitorSlot.deleteMany({ where: { lastSeenAt: { lt: new Date(now - PRESENCE_WINDOW_MS) } } });
  } catch (error) {
    console.error('[activity] stale visitor rows could not be cleared', error);
  }
}

/** Ids come from the browser; keep them inert before using them as a row key. */
function normaliseVisitorId(value: string | undefined): string | null {
  if (typeof value !== 'string') return null;
  return /^[A-Za-z0-9_-]{8,64}$/.test(value) ? value : null;
}

/** Only a path, never a query string or an origin — this string is displayed. */
function safePage(value: string | undefined): string {
  const raw = (value ?? '').split('?')[0].split('#')[0];
  if (!raw.startsWith('/') || raw.startsWith('//')) return '/';
  return raw.slice(0, 80);
}
