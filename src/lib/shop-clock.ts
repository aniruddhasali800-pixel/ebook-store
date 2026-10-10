/**
 * The shop's clock, written down once.
 *
 * Three modules used to ask the machine what time zone it lives in —
 * `process.env.TZ ?? 'Asia/Kolkata'` — and a deployment host answers that with
 * UTC. That is not a cosmetic drift: a refund deadline would read "due 6:30 pm"
 * on one screen and "due 1:00 pm" on another that happened to read the browser's
 * clock, while the two-working-day rule in `case-rules.ts` counts in IST
 * whatever the host believes. A time zone is a fact about the shop, not about
 * the server, so nothing here consults the environment for it — and on Vercel
 * the value its build reports for `TZ` is one `Intl` refuses outright, which
 * failed the deploy before it could show anyone a wrong minute.
 */
export const SHOP_TIME_ZONE = 'Asia/Kolkata';

const dateTime = new Intl.DateTimeFormat('en-IN', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: SHOP_TIME_ZONE,
});

const day = new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeZone: SHOP_TIME_ZONE });

/** "05 Mar 2026, 3:30 pm" — the instant, in the shop's own hours. */
export function stampDateTime(at: Date | number): string {
  return dateTime.format(at);
}

/** The calendar day alone, for rows where the minute is noise. */
export function stampDay(at: Date | number): string {
  return day.format(at);
}
