import type { RefundStatus, ComplaintStatus } from './case-status';

export type { RefundStatus, ComplaintStatus };

/**
 * The rules behind the two review queues, with no database and no `server-only`
 * guard — the same split `src/lib/payments/status.ts` makes for payments, so these
 * can be tested in plain Node and imported by either side of the app.
 *
 * The refund rule in one sentence: a refund is a promise the shop keeps by moving
 * money itself, so this site may never say the customer has been paid back until a
 * human says so. Nothing here reverses anything. It tracks a request, gives the shop
 * a deadline to answer it, and records the payout reference a person obtained
 * outside this app. The order keeps its PAID payment status throughout, because that
 * is the truth about what arrived; the refund lives on a separate axis.
 */

/** How long a buyer has, after payment lands, to ask for their money back. */
export const REFUND_REQUEST_WINDOW_HOURS = 24;
/** Working days the shop commits to for reviewing a request. */
export const REFUND_REVIEW_WORKING_DAYS = 2;

export type CaseActor = 'CUSTOMER' | 'STAFF';

export class CaseStateMachineError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CaseStateMachineError';
  }
}

/**
 * Who may move a refund to what. A customer files; only staff decide, and only
 * staff can write REFUNDED — which is the whole honesty guarantee of this file.
 */
const REFUND_TRANSITIONS: Record<
  RefundStatus,
  readonly { to: RefundStatus; allowedFor: readonly CaseActor[] }[]
> = {
  REQUESTED: [
    { to: 'APPROVED', allowedFor: ['STAFF'] },
    { to: 'REJECTED', allowedFor: ['STAFF'] },
  ],
  // Approved waits for the shop to actually pay the customer back.
  APPROVED: [
    { to: 'REFUNDED', allowedFor: ['STAFF'] },
    { to: 'REJECTED', allowedFor: ['STAFF'] },
  ],
  REFUNDED: [],
  REJECTED: [],
};

export function canMoveRefund(from: RefundStatus, to: RefundStatus, actor: CaseActor): boolean {
  return REFUND_TRANSITIONS[from].some((t) => t.to === to && t.allowedFor.includes(actor));
}

export function assertRefundMove(from: RefundStatus, to: RefundStatus, actor: CaseActor): void {
  const move = REFUND_TRANSITIONS[from].find((t) => t.to === to);
  if (!move) {
    throw new CaseStateMachineError(
      `A refund cannot go from ${from} to ${to}. ${
        to === 'REFUNDED'
          ? 'Only an approved refund can be marked paid back.'
          : 'This decision has already been made.'
      }`,
    );
  }
  if (!move.allowedFor.includes(actor)) {
    throw new CaseStateMachineError(
      'A customer cannot decide a refund. Approval, rejection and the payout confirmation belong to the shop.',
    );
  }
}

const COMPLAINT_TRANSITIONS: Record<
  ComplaintStatus,
  readonly { to: ComplaintStatus; allowedFor: readonly CaseActor[] }[]
> = {
  OPEN: [
    // Answering is a staff act; a buyer may withdraw without waiting for anyone.
    { to: 'ANSWERED', allowedFor: ['STAFF'] },
    { to: 'CLOSED', allowedFor: ['STAFF', 'CUSTOMER'] },
  ],
  ANSWERED: [{ to: 'CLOSED', allowedFor: ['STAFF', 'CUSTOMER'] }],
  CLOSED: [],
};

export function canMoveComplaint(
  from: ComplaintStatus,
  to: ComplaintStatus,
  actor: CaseActor,
): boolean {
  return COMPLAINT_TRANSITIONS[from].some((t) => t.to === to && t.allowedFor.includes(actor));
}

export function assertComplaintMove(
  from: ComplaintStatus,
  to: ComplaintStatus,
  actor: CaseActor,
): void {
  const move = COMPLAINT_TRANSITIONS[from].find((entry) => entry.to === to);
  if (!move) {
    throw new CaseStateMachineError(
      to === from
        ? `That complaint is already ${from.toLowerCase()}.`
        : `A complaint cannot go from ${from} to ${to}.`,
    );
  }
  if (!move.allowedFor.includes(actor)) {
    throw new CaseStateMachineError('Answering a complaint is a staff action.');
  }
}

/**
 * Days that never count towards the review deadline: Saturdays, Sundays, and any
 * date listed in `REFUND_HOLIDAYS` as YYYY-MM-DD (comma separated). Weekends are
 * hardcoded because they are not a preference; holidays are config because the
 * list is a business decision that differs by state and by year.
 */
function holidaySet(): Set<string> {
  return new Set(
    (process.env.REFUND_HOLIDAYS ?? '')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean),
  );
}

/** The buyer's calendar day, in the shop's own timezone, whatever the server's is. */
export function shopDayKey(at: Date, timeZone = 'Asia/Kolkata'): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(at);
}

export function isWorkingDay(dayKey: string, holidays: ReadonlySet<string> = holidaySet()): boolean {
  if (holidays.has(dayKey)) return false;
  // en-US weekday for a date-only key is unambiguous: noon keeps us off DST edges.
  const weekday = new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', weekday: 'short' }).format(
    new Date(`${dayKey}T12:00:00Z`),
  );
  return weekday !== 'Sat' && weekday !== 'Sun';
}

/**
 * The deadline for reviewing a request filed at `from`: N working days later, at the
 * end of that day in the shop's timezone. Counting starts at the next working day
 * after filing, so a request filed Friday evening gets Monday and Tuesday rather
 * than a weekend's worth of "reviewed".
 */
export function reviewDeadlineAt(from: Date, workingDays = REFUND_REVIEW_WORKING_DAYS): Date {
  const holidays = holidaySet();
  let key = shopDayKey(from);
  let counted = 0;
  const cursor = new Date(from.getTime());

  while (counted < workingDays) {
    cursor.setUTCDate(cursor.getUTCDate() + 1);
    key = shopDayKey(cursor);
    if (!isWorkingDay(key, holidays)) continue;
    counted += 1;
  }

  // 23:59:59 IST on the last counted day = 18:29:59 UTC.
  return new Date(`${key}T18:29:59Z`);
}

export type RefundRefusal =
  | 'not_paid'
  | 'no_payment_time'
  | 'window_closed'
  | 'already_decided'
  | 'open_request';

export type RefundEligibility =
  | { eligible: true; requestUntil: Date; paidAt: Date }
  | { eligible: false; reason: RefundRefusal; requestUntil?: Date };

/**
 * Whether this order may carry a new refund request, and until when.
 *
 * The window is measured from the moment the payment was confirmed, not from the
 * order being placed — a claim made at 11pm and verified next morning should not
 * cost the buyer ten hours of their twenty-four.
 */
export function refundEligibility(
  order: { paymentStatus: string; paidAt: Date | null; refunds: { status: string }[] },
  now = new Date(),
): RefundEligibility {
  if (order.paymentStatus !== 'PAID') return { eligible: false, reason: 'not_paid' };
  if (!order.paidAt) return { eligible: false, reason: 'no_payment_time' };

  const open = order.refunds.find(
    (refund) => refund.status === 'REQUESTED' || refund.status === 'APPROVED',
  );
  if (open) return { eligible: false, reason: 'open_request' };
  if (order.refunds.some((refund) => refund.status === 'REFUNDED')) {
    return { eligible: false, reason: 'already_decided' };
  }
  if (order.refunds.some((refund) => refund.status === 'REJECTED')) {
    return { eligible: false, reason: 'already_decided' };
  }

  const requestUntil = new Date(
    order.paidAt.getTime() + REFUND_REQUEST_WINDOW_HOURS * 3_600_000,
  );
  if (now.getTime() > requestUntil.getTime()) {
    return { eligible: false, reason: 'window_closed', requestUntil };
  }
  return { eligible: true, requestUntil, paidAt: order.paidAt };
}

/**
 * Why a request was refused, in the buyer's language. The receipt page has to
 * explain the same refusal before the customer ever submits the form, so the words
 * live beside the rule that produces them.
 */
export const REFUND_REFUSALS: Record<RefundRefusal, string> = {
  not_paid: 'There is no confirmed payment on this order to refund yet.',
  no_payment_time:
    'This order was confirmed before the shop started recording payment times, so a refund has to be arranged with the shop directly.',
  window_closed:
    'The 24-hour window for asking for a refund has closed on this order. Send the shop a complaint instead and they will look at it by hand.',
  open_request: 'A request on this order is already with the shop. Its status is shown above.',
  already_decided:
    'A decision has already been made about this order. If you disagree with it, send the shop a complaint.',
};

/** What the buyer sees. Never implies money moved before a staff confirmation. */
export const REFUND_CUSTOMER_COPY: Record<RefundStatus, string> = {
  REQUESTED:
    'Your request is with the shop. It will be reviewed within two working days, counted from the day your payment was confirmed.',
  APPROVED:
    'The shop approved your refund. It is being sent back to you — usually to the account or UPI ID you paid from — and this page will change once that is done.',
  REFUNDED:
    'The shop has paid you back. Money left the shop’s own account, so allow a working day for your bank to show it.',
  REJECTED:
    'The shop refused this refund. The reason is on the dashboard, and you can still send them a complaint about it.',
};

export function refundCustomerCopy(status: RefundStatus): string {
  return REFUND_CUSTOMER_COPY[status];
}
