'use client';

import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import Link from 'next/link';

type ActivityEvent = {
  /** Database id, used as the cursor into the queue. Mirrors src/lib/activity.ts */
  id: number;
  type: string;
  channel?: string | null;
  headline: string;
  detail?: string | null;
  href?: string | null;
  at: number;
};

const FALLBACK_POLL_MS = 4_000;

const TONE: Record<string, string> = {
  arrival: 'bg-sky-100 text-sky-800 ring-sky-200',
  order: 'bg-zinc-100 text-zinc-800 ring-zinc-200',
  claim: 'bg-amber-100 text-amber-900 ring-amber-200',
  payment: 'bg-zinc-100 text-zinc-800 ring-zinc-200',
  settled: 'bg-emerald-100 text-emerald-800 ring-emerald-200',
  stock: 'bg-rose-100 text-rose-900 ring-rose-200',
  refund: 'bg-rose-100 text-rose-800 ring-rose-200',
  complaint: 'bg-orange-100 text-orange-900 ring-orange-200',
  book: 'bg-violet-100 text-violet-800 ring-violet-200',
};

/**
 * Event types that make a noise.
 *
 * A claim is the important one: it is a customer standing at a QR code saying they
 * have paid, and the queue that answers them is this page. A settlement is included
 * because whoever marked it paid should hear the shop agree. Everything else —
 * arrivals, refunds, complaints, an order marked failed — stays silent, or a counter
 * would be listening to a chime that means nothing at the till.
 */
const LOUD = new Set(['claim', 'settled']);

const SOUND_KEY = 'staff.alerts.sound';
const DESKTOP_KEY = 'staff.alerts.desktop';
/** Fired at this window only, so a second dashboard tab on the same machine keeps its own switches. */
const PREFS_CHANGED = 'staff-alerts-prefs';

function readFlag(key: string): boolean {
  try {
    return localStorage.getItem(key) === 'on';
  } catch {
    return false;
  }
}

function writeFlag(key: string, on: boolean): void {
  try {
    localStorage.setItem(key, on ? 'on' : 'off');
  } catch {
    // Private mode with storage blocked: the switch still works for this visit.
  }
  window.dispatchEvent(new Event(PREFS_CHANGED));
}

function subscribeToPrefs(onChange: () => void): () => void {
  window.addEventListener(PREFS_CHANGED, onChange);
  return () => window.removeEventListener(PREFS_CHANGED, onChange);
}

/**
 * The "right now" strip on the staff dashboards.
 *
 * The page renders the queue it was given, then keeps asking the server for
 * whatever has been added since its last look. Polling, not a held-open socket: a
 * serverless runtime cannot carry a connection for a whole shift, and the queue
 * now lives in the database, so a payment settled on one machine is news on every
 * dashboard. `cursor` is the highest event id this page has already seen — the
 * first answer is only ever things that happened after the page was rendered.
 *
 * `scope` is which half of the shop this dashboard belongs to. A cafe till and a
 * book shop share one queue, so the chime has to know whose money it is announcing.
 *
 * The two switches are stored in localStorage and read through
 * `useSyncExternalStore`: the preference is a browser setting, not application
 * state, and this way it survives a reload without the page having to guess on the
 * first render whether it is hydrated yet.
 */
export function LiveActivity({
  initialEvents,
  scope,
}: {
  initialEvents: ActivityEvent[];
  scope: 'CAFE' | 'BOOKS';
}) {
  const [events, setEvents] = useState<ActivityEvent[]>(initialEvents);
  const [connected, setConnected] = useState(false);
  const [activeNow, setActiveNow] = useState(0);
  const [lastAlert, setLastAlert] = useState<ActivityEvent | null>(null);
  /** The speaker stays asleep until a click on this page wakes it. */
  const [needsGesture, setNeedsGesture] = useState(false);
  /** Only known once somebody has pressed the button — the browser will not say sooner. */
  const [permission, setPermission] = useState<NotificationPermission | null>(null);

  const soundOn = useSyncExternalStore(subscribeToPrefs, () => readFlag(SOUND_KEY), () => false);
  // A stored wish is only an alert if the browser agreed to it, so the permission
  // travels inside the same snapshot; granting it writes the flag again and this
  // re-reads.
  const desktopOn = useSyncExternalStore(
    subscribeToPrefs,
    () => readFlag(DESKTOP_KEY) && typeof Notification !== 'undefined' && Notification.permission === 'granted',
    () => false,
  );

  /** Highest event id already shown, so a later answer never re-rings an old payment. */
  const cursor = useRef(initialEvents.reduce((highest, event) => Math.max(highest, event.id), 0));
  const audio = useRef<AudioContext | null>(null);
  // The poll loop is installed once and reads the switches through a ref, so
  // turning the chime on never has to restart anything.
  const prefs = useRef({ sound: false, desktop: false, scope });

  useEffect(() => {
    prefs.current = { sound: soundOn, desktop: desktopOn, scope };
  }, [soundOn, desktopOn, scope]);

  useEffect(() => {
    let stopped = false;
    let everyMs = FALLBACK_POLL_MS;

    const lookForNews = async () => {
      try {
        const response = await fetch(`/api/activity/poll?since=${cursor.current}`, { cache: 'no-store' });
        if (!response.ok) throw new Error(`poll returned ${response.status}`);
        const payload = (await response.json()) as {
          events?: ActivityEvent[];
          visitors?: number;
          pollMs?: number;
        };
        if (stopped) return;
        setConnected(true);
        if (typeof payload.visitors === 'number') setActiveNow(payload.visitors);
        if (payload.pollMs && payload.pollMs >= 1_000) everyMs = payload.pollMs;

        for (const event of payload.events ?? []) {
          // Two answers can overlap; the cursor is what makes that harmless.
          if (event.id <= cursor.current) continue;
          cursor.current = event.id;
          setEvents((current) => [event, ...current].slice(0, 24));
          // A quiet dashboard is the point: only this half of the shop, and only
          // the two kinds of money news, are allowed to make a sound.
          if (event.channel !== prefs.current.scope || !LOUD.has(event.type)) continue;
          setLastAlert(event);
          if (prefs.current.sound) {
            audio.current ??= openAudioContext();
            if (!playChime(audio.current, event.type)) setNeedsGesture(true);
          }
          if (prefs.current.desktop) showDesktopNotice(event);
        }
      } catch {
        if (!stopped) setConnected(false);
      }
    };

    // Look once straight away: the page was rendered with a head count of zero,
    // and "nobody is here" is worth correcting before the first beat arrives.
    void lookForNews();
    const stopTicking = createTicker(() => void lookForNews(), () => everyMs);
    // Re-render on the clock so the "12s ago" labels do not go stale.
    const clock = setInterval(() => setEvents((current) => [...current]), 30_000);

    return () => {
      stopped = true;
      stopTicking();
      clearInterval(clock);
    };
  }, []);

  function setSound(on: boolean) {
    writeFlag(SOUND_KEY, on);
    if (on) {
      audio.current ??= openAudioContext();
      // Switching the chime on proves itself with a sound, so a dead speaker is
      // discovered now rather than by a missed payment.
      setNeedsGesture(!playChime(audio.current, 'claim'));
    }
  }

  async function setDesktop(on: boolean) {
    if (on && typeof Notification !== 'undefined' && Notification.permission !== 'granted') {
      const result = await Notification.requestPermission();
      setPermission(result);
      // Asked and refused is not the same as asked and granted: only persist the
      // wish if the browser actually said yes.
      if (result !== 'granted') return;
    }
    writeFlag(DESKTOP_KEY, on);
  }

  return (
    <section
      aria-label="Live activity"
      className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-zinc-200"
    >
      <div className="flex flex-wrap items-center gap-3">
        <span
          className={`inline-flex items-center gap-2 rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider ring-1 ${
            connected
              ? 'bg-emerald-50 text-emerald-800 ring-emerald-200'
              : 'bg-zinc-100 text-zinc-600 ring-zinc-200'
          }`}
        >
          <span
            className={`size-1.5 rounded-full ${connected ? 'animate-pulse bg-emerald-500' : 'bg-zinc-400'}`}
            aria-hidden
          />
          {connected ? 'Live' : 'Reconnecting'}
        </span>

        <span className="text-sm text-zinc-600">
          <strong className="font-semibold text-zinc-900 tabular-nums">{activeNow}</strong>
          {' '}on the site now
        </span>

        {events[0] ? (
          <span className="ml-auto text-xs text-zinc-500">last: {ago(events[0].at)}</span>
        ) : null}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-zinc-100 pt-3 text-xs">
        <button
          type="button"
          onClick={() => setSound(!soundOn)}
          aria-pressed={soundOn}
          className={`rounded-lg px-2.5 py-1 font-medium ring-1 transition ${
            soundOn
              ? 'bg-zinc-900 text-white ring-zinc-900'
              : 'bg-white text-zinc-600 ring-zinc-200 hover:text-zinc-900'
          }`}
        >
          Chime {soundOn ? 'on' : 'off'}
        </button>
        <button
          type="button"
          onClick={() => void setDesktop(!desktopOn)}
          aria-pressed={desktopOn}
          className={`rounded-lg px-2.5 py-1 font-medium ring-1 transition ${
            desktopOn
              ? 'bg-zinc-900 text-white ring-zinc-900'
              : 'bg-white text-zinc-600 ring-zinc-200 hover:text-zinc-900'
          }`}
        >
          {desktopOn ? 'Desktop alerts on' : 'Desktop alerts off'}
        </button>
        <button
          type="button"
          onClick={() => {
            audio.current ??= openAudioContext();
            setNeedsGesture(!playChime(audio.current, 'claim'));
          }}
          className="rounded-lg px-2 py-1 text-zinc-500 underline-offset-2 hover:text-zinc-800 hover:underline"
        >
          test the chime
        </button>

        <span className="text-zinc-500">
          {LOUD_DESCRIPTION}
        </span>

        {needsGesture && soundOn ? (
          <span className="text-amber-700">
            This tab has not been allowed to make a sound yet — press anything on the page once.
          </span>
        ) : null}
        {permission === 'denied' ? (
          <span className="text-rose-700">
            The browser is blocking notifications for this site. Allow them in the address bar, then
            switch this back on.
          </span>
        ) : null}
        {lastAlert ? (
          <span className="ml-auto text-zinc-500">rang: {lastAlert.type} · {ago(lastAlert.at)} ago</span>
        ) : null}
      </div>

      <ul className="mt-3 max-h-64 space-y-1.5 overflow-y-auto pr-1">
        {events.map((event) => (
          <li
            key={event.id}
            className={`flex items-start gap-2.5 rounded-lg border px-3 py-2 ${
              lastAlert?.id === event.id
                ? 'border-amber-200 bg-amber-50/70'
                : 'border-zinc-100 bg-zinc-50/50'
            }`}
          >
            <span
              className={`mt-0.5 shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider ring-1 ${TONE[event.type] ?? TONE.order}`}
            >
              {event.type}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium text-zinc-900">
                {event.href ? (
                  <Link href={event.href} className="hover:underline">
                    {event.headline}
                  </Link>
                ) : (
                  event.headline
                )}
              </span>
              {event.detail ? (
                <span className="mt-0.5 block truncate text-xs text-zinc-500">{event.detail}</span>
              ) : null}
            </span>
            <span className="shrink-0 text-[11px] tabular-nums text-zinc-400">{ago(event.at)}</span>
          </li>
        ))}
        {events.length === 0 ? (
          <li className="px-3 py-6 text-center text-sm text-zinc-500">
            Nothing yet. Arrivals, payments and requests appear here as they happen.
          </li>
        ) : null}
      </ul>
    </section>
  );
}

/**
 * A timer that keeps its beat while the tab is in the background.
 *
 * A hidden page gets its `setInterval` slowed to roughly one run a minute, and the
 * cashier who alt-tabs to the bank app to check a UTR is precisely the person who
 * must not miss the chime. A worker owns its own clock and is left alone, so the
 * feed keeps asking every few seconds either way. If the browser will not hand over
 * a worker, the interval fallback still works — it is only slower while hidden, and
 * the strip says so by going to "Reconnecting" only when a request actually fails.
 */
function createTicker(onTick: () => void, getDelayMs: () => number): () => void {
  try {
    const worker = new Worker(
      URL.createObjectURL(new Blob(['setInterval(() => postMessage(0), 1000)'], { type: 'text/javascript' })),
    );
    let elapsed = 0;
    worker.onmessage = () => {
      elapsed += 1;
      if (elapsed * 1_000 >= getDelayMs()) {
        elapsed = 0;
        onTick();
      }
    };
    return () => worker.terminate();
  } catch {
    const handle = setInterval(onTick, getDelayMs());
    return () => clearInterval(handle);
  }
}

/**
 * Created lazily and resumed on the spot: a browser will not let a page play a sound
 * until somebody has touched it, so a call made before any click may come back
 * asleep, and the caller has to say so instead of assuming the speaker is broken.
 */
function openAudioContext(): AudioContext | null {
  try {
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    const ctx = new Ctor();
    void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

/**
 * Returns whether a sound actually came out.
 *
 * A claim is two short upward pings — the sound of something needing attention. A
 * settlement is one longer note, so the two are never confused at a counter.
 */
function playChime(ctx: AudioContext | null, type: string): boolean {
  if (!ctx || ctx.state !== 'running') return false;
  const notes: [number, number, number][] =
    type === 'claim' ? [[784, 0, 0.12], [988, 0.15, 0.14]] : [[587, 0, 0.3]];
  for (const [frequency, start, length] of notes) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const at = ctx.currentTime + start;
    osc.type = 'sine';
    osc.frequency.value = frequency;
    gain.gain.setValueAtTime(0.0001, at);
    // Ramped rather than switched: an instant gain change clicks.
    gain.gain.exponentialRampToValueAtTime(0.09, at + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + length);
    osc.connect(gain).connect(ctx.destination);
    osc.start(at);
    osc.stop(at + length + 0.02);
  }
  return true;
}

function showDesktopNotice(event: ActivityEvent) {
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
  try {
    new Notification(event.headline, {
      body: event.detail ?? '',
      tag: `activity-${event.id}`,
      // The chime already spoke; a second sound from the operating system would only double it.
      silent: true,
    });
  } catch {
    // Some browsers refuse to construct a notification outside a service worker.
    // The in-page strip still shows the event, so nothing is lost but the popup.
  }
}

/**
 * What the switches announce, said plainly: a counter who turns this on should know
 * which of the two sounds means a customer's word and which means the shop's own
 * decision, without being surprised by either.
 */
const LOUD_DESCRIPTION = 'two pings when a buyer says they paid, one when a payment is marked paid';

function ago(at: number): string {
  const seconds = Math.max(0, Math.round((Date.now() - at) / 1000));
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
  if (seconds < 86_400) return `${Math.round(seconds / 3600)}h`;
  return `${Math.round(seconds / 86_400)}d`;
}
