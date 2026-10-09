import { prisma } from '@/lib/db';
import { getSessionPayload } from '@/lib/auth/session';
import { activityFeed, onActivity, type ActivityEvent } from '@/lib/activity';

/**
 * Server-sent events for the staff dashboard.
 *
 * SSE rather than polling: the dashboard should light up the second a customer
 * does something, and one long-lived connection per open dashboard is cheaper
 * than a five-second request each. The staff session cookie rides along on the
 * initial GET, which is why the stream is checked here instead of trusting the
 * page that embeds it.
 */
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const payload = await getSessionPayload();
  if (!payload) {
    return new Response('unauthorised', { status: 401, headers: { 'cache-control': 'no-store' } });
  }
  const user = await prisma.user.findUnique({ where: { id: payload.userId }, select: { id: true, role: true } });
  if (!user || (user.role !== 'ADMIN' && user.role !== 'CASHIER')) {
    return new Response('unauthorised', { status: 401, headers: { 'cache-control': 'no-store' } });
  }

  const encoder = new TextEncoder();
  let unsubscribe: (() => void) | null = null;
  let heartbeat: ReturnType<typeof setInterval> | null = null;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (event: ActivityEvent) => {
        controller.enqueue(encoder.encode(`event: activity\ndata: ${JSON.stringify(event)}\n\n`));
      };

      // Replay the recent feed first so a dashboard opened mid-shift is not blank.
      // These carry `replayed` so the client can tell history it asked for from a
      // payment that just happened; only the second one deserves a noise.
      for (const event of activityFeed(12)) send({ ...event, replayed: true });

      unsubscribe = onActivity((event) => {
        try {
          send(event);
        } catch {
          // The reader is gone; the interval below will notice and close.
        }
      });

      heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(': keep-alive\n\n'));
        } catch {
          // The reader went away mid-write; stop feeding and let the stream close.
          if (heartbeat) clearInterval(heartbeat);
          unsubscribe?.();
        }
      }, 25_000);

      request.signal.addEventListener('abort', () => {
        unsubscribe?.();
        if (heartbeat) clearInterval(heartbeat);
      });
    },
    cancel() {
      unsubscribe?.();
      if (heartbeat) clearInterval(heartbeat);
    },
  });

  return new Response(stream, {
    headers: {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-store, no-transform',
      connection: 'keep-alive',
      'x-accel-buffering': 'no',
    },
  });
}
