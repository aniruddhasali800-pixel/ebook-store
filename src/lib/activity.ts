import 'server-only';
import { EventEmitter } from 'node:events';

/**
 * What is happening on the site right now, for the shop's own dashboard.
 *
 * Deliberately in memory and deliberately short-lived: a visitor is a number
 * plus a page for ninety seconds, then it is gone. Nothing here persists an IP
 * address, a user agent or a cross-visit profile, and there is no table to read
 * later — the question the dashboard asks is "is anyone here now", not "who was
 * here in March".
 *
 * The cost of that choice: this is per-process state. Behind several app
 * instances each one would see only its own visitors, and the SSE stream would
 * miss events published elsewhere. Move both to a shared store (Redis, or the
 * host's pub/sub) before running more than one instance.
 */

const PRESENCE_TTL_MS = 90_000;
const ARRIVAL_MEMORY = 20;

export type ActivityEvent = {
  id: string;
  /** arrival | order | claim | refund | complaint | book | payment | stock */
  type: string;
  /**
   * Which half of the shop the event belongs to: CAFE or BOOKS. A cashier on the
   * cafe queue should not hear a chime for a book somebody bought, so the
   * dashboard filters on this before it makes any noise. Events about the site as
   * a whole (an arrival) carry none and are never allowed to chime.
   */
  channel?: string;
  headline: string;
  detail?: string;
  href?: string;
  at: number;
  /**
   * Set only on the events the stream replays when a dashboard connects. It exists
   * so the chime can be kept for things that are happening now: a dashboard opened
   * mid-shift should show the last twelve events silently, not ring twelve times.
   */
  replayed?: boolean;
};

type Visitor = { id: string; page: string; firstSeenAt: number; lastSeenAt: number };

const visitors = new Map<string, Visitor>();
const arrivals: ActivityEvent[] = [];
const feed: ActivityEvent[] = [];
const bus = new EventEmitter();
bus.setMaxListeners(64);

let sequence = 0;
function nextId(prefix: string): string {
  sequence += 1;
  return `${prefix}-${Date.now().toString(36)}-${sequence}`;
}

function prune(now: number): void {
  for (const [id, visitor] of visitors) {
    if (now - visitor.lastSeenAt > PRESENCE_TTL_MS) visitors.delete(id);
  }
}

/**
 * A page view from a customer. Returns whether this counts as them arriving, so
 * the dashboard is told once per visit rather than once per navigation.
 */
export function recordVisit(input: { visitorId?: string; page?: string }): { isNew: boolean; activeNow: number } {
  const now = Date.now();
  prune(now);

  const id = normaliseVisitorId(input.visitorId);
  if (!id) return { isNew: false, activeNow: visitors.size };

  const existing = visitors.get(id);
  const page = safePage(input.page);
  if (existing) {
    existing.lastSeenAt = now;
    existing.page = page;
    return { isNew: false, activeNow: visitors.size };
  }

  visitors.set(id, { id, page, firstSeenAt: now, lastSeenAt: now });
  const event = publishActivity({
    type: 'arrival',
    headline: 'A customer arrived',
    // The running count rides along so the dashboard needs one stream, not two.
    detail: `${page} · active:${visitors.size}`,
    href: page,
    at: now,
  });
  arrivals.unshift(event);
  arrivals.length = Math.min(arrivals.length, ARRIVAL_MEMORY);

  return { isNew: true, activeNow: visitors.size };
}

export function activeVisitors(now = Date.now()): { count: number; pages: { page: string; secondsAgo: number }[] } {
  prune(now);
  return {
    count: visitors.size,
    pages: [...visitors.values()]
      .sort((a, b) => b.lastSeenAt - a.lastSeenAt)
      .slice(0, 8)
      .map((visitor) => ({ page: visitor.page, secondsAgo: Math.round((now - visitor.lastSeenAt) / 1000) })),
  };
}

export function recentArrivals(): ActivityEvent[] {
  return arrivals.slice(0, 8);
}

/** Add a dashboard alert — an order, a payment claim, a refund request. */
export function publishActivity(event: Omit<ActivityEvent, 'id' | 'at'> & { at?: number }): ActivityEvent {
  const entry: ActivityEvent = { at: Date.now(), ...event, id: nextId(event.type) };
  feed.unshift(entry);
  feed.length = Math.min(feed.length, 40);
  bus.emit('activity', entry);
  return entry;
}

export function activityFeed(limit = 20): ActivityEvent[] {
  return feed.slice(0, limit);
}

/** Subscribe the SSE route to whatever gets published. Returns an unsubscribe. */
export function onActivity(listener: (event: ActivityEvent) => void): () => void {
  bus.on('activity', listener);
  return () => bus.off('activity', listener);
}

/** Ids come from the browser; keep them inert before using them as a map key. */
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
