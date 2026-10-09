import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  assertComplaintMove,
  assertRefundMove,
  canMoveRefund,
  CaseStateMachineError,
  isWorkingDay,
  REFUND_CUSTOMER_COPY,
  REFUND_REFUSALS,
  refundEligibility,
  reviewDeadlineAt,
  shopDayKey,
  type CaseActor,
} from '../src/lib/case-rules';

/**
 * The refund and complaint rules, tested where they are decided rather than where
 * they are written to a database.
 *
 * The two properties that matter most are the ones a UI could get wrong in the
 * friendliest possible way: that a customer can never produce `REFUNDED`, and that
 * a deadline counts in the shop's working days rather than in raw 48-hour blocks.
 */

const paidOrder = {
  paymentStatus: 'PAID',
  paidAt: new Date('2026-10-02T06:00:00Z'),
  refunds: [] as { status: string }[],
};

test('a buyer has 24 hours from confirmation, not from the order being placed', () => {
  const confirmed = paidOrder.paidAt!;

  const inside = refundEligibility(paidOrder, new Date(confirmed.getTime() + 23 * 3_600_000));
  assert.equal(inside.eligible, true);
  if (!inside.eligible) throw new Error('unreachable');
  assert.equal(inside.requestUntil.getTime(), confirmed.getTime() + 24 * 3_600_000);

  const outside = refundEligibility(paidOrder, new Date(confirmed.getTime() + 25 * 3_600_000));
  assert.equal(outside.eligible, false);
  assert.equal(outside.reason, 'window_closed');
});

/** Reads the reason out of a refusal, failing loudly if the order was accepted. */
function refusal(order: Parameters<typeof refundEligibility>[0], now = new Date()): string {
  const result = refundEligibility(order, now);
  assert.equal(result.eligible, false, 'expected this order to be refused');
  return result.eligible ? 'eligible' : result.reason;
}

test('an unpaid or undated order cannot ask for money back', () => {
  assert.equal(refusal({ ...paidOrder, paymentStatus: 'PAYMENT_VERIFICATION_PENDING' }), 'not_paid');
  assert.equal(refusal({ ...paidOrder, paidAt: null }), 'no_payment_time');
});

test('one request at a time, and a finished decision does not re-open', () => {
  assert.equal(refusal({ ...paidOrder, refunds: [{ status: 'REQUESTED' }] }), 'open_request');
  assert.equal(refusal({ ...paidOrder, refunds: [{ status: 'APPROVED' }] }), 'open_request');
  assert.equal(refusal({ ...paidOrder, refunds: [{ status: 'REFUNDED' }] }), 'already_decided');
  assert.equal(refusal({ ...paidOrder, refunds: [{ status: 'REJECTED' }] }), 'already_decided');
});

test('every refusal a buyer can be given has words they can read', () => {
  for (const reason of ['not_paid', 'no_payment_time', 'window_closed', 'open_request', 'already_decided'] as const) {
    assert.ok(REFUND_REFUSALS[reason].length > 20, `${reason} needs real copy`);
    assert.doesNotMatch(REFUND_REFUSALS[reason], /\b(money has been|already refunded)\b/i);
  }
});

test('a customer cannot approve, refuse or confirm a refund', () => {
  // Approval and rejection are legal moves for staff, so a customer attempting
  // one is refused by the actor guard and hears the true reason.
  for (const to of ['APPROVED', 'REJECTED'] as const) {
    assert.equal(canMoveRefund('REQUESTED', to, 'CUSTOMER'), false);
    assert.throws(
      () => assertRefundMove('REQUESTED', to, 'CUSTOMER'),
      (error: unknown) => error instanceof CaseStateMachineError && /customer cannot decide/i.test((error as Error).message),
    );
  }
  // Skipping the review and jumping to a payout is not a move the table allows
  // from REQUESTED at all, so the state machine stops it before the actor check.
  assert.equal(canMoveRefund('REQUESTED', 'REFUNDED', 'CUSTOMER'), false);
  assert.throws(() => assertRefundMove('REQUESTED', 'REFUNDED', 'CUSTOMER'), CaseStateMachineError);
});

test('only an approved refund can be marked paid back, even by staff', () => {
  assert.equal(canMoveRefund('REQUESTED', 'REFUNDED', 'STAFF'), false);
  assert.throws(
    () => assertRefundMove('REQUESTED', 'REFUNDED', 'STAFF'),
    /only an approved refund can be marked paid back/i,
  );
  assert.equal(canMoveRefund('APPROVED', 'REFUNDED', 'STAFF'), true);
});

test('a settled refund is a dead end', () => {
  for (const from of ['REFUNDED', 'REJECTED'] as const) {
    for (const to of ['REQUESTED', 'APPROVED', 'REFUNDED', 'REJECTED'] as const) {
      assert.equal(canMoveRefund(from, to, 'STAFF'), false, `${from} to ${to} must stay closed`);
    }
  }
});

test('answering a complaint is staff work, closing one is not', () => {
  assert.throws(() => assertComplaintMove('OPEN', 'ANSWERED', 'CUSTOMER'), /staff action/i);
  assert.doesNotThrow(() => assertComplaintMove('OPEN', 'CLOSED', 'CUSTOMER'));
  assert.doesNotThrow(() => assertComplaintMove('ANSWERED', 'CLOSED', 'STAFF'));
  assert.throws(() => assertComplaintMove('CLOSED', 'OPEN', 'STAFF'), /cannot go from CLOSED to OPEN/i);
});

test('the shop day is Indian time whatever clock the server runs on', () => {
  // 18:30 UTC is the next calendar day in India.
  assert.equal(shopDayKey(new Date('2026-10-02T18:30:00Z')), '2026-10-03');
  assert.equal(shopDayKey(new Date('2026-10-02T17:30:00Z')), '2026-10-02');
});

test('weekends are never working days', () => {
  assert.equal(isWorkingDay('2026-10-02', new Set()), true); // Friday
  assert.equal(isWorkingDay('2026-10-03', new Set()), false); // Saturday
  assert.equal(isWorkingDay('2026-10-04', new Set()), false); // Sunday
  assert.equal(isWorkingDay('2026-10-05', new Set()), true); // Monday
  assert.equal(isWorkingDay('2026-10-05', new Set(['2026-10-05'])), false);
});

test('a request filed Friday evening is due Tuesday, not Sunday', () => {
  // Friday 2026-10-02 at 19:30 IST.
  const fridayEvening = new Date('2026-10-02T14:00:00Z');
  assert.deepEqual(reviewDeadlineAt(fridayEvening), new Date('2026-10-06T18:29:59Z'));
  assert.equal(shopDayKey(reviewDeadlineAt(fridayEvening)), '2026-10-06');
});

test('a request filed Saturday still gets Monday and Tuesday', () => {
  const saturdayMorning = new Date('2026-10-03T04:30:00Z');
  assert.deepEqual(reviewDeadlineAt(saturdayMorning, 2), new Date('2026-10-06T18:29:59Z'));
});

test('a holiday in the shop’s own list pushes the deadline out', () => {
  const previous = process.env.REFUND_HOLIDAYS;
  process.env.REFUND_HOLIDAYS = '2026-10-05';
  try {
    // Monday is shut, so two working days from Monday are Tuesday and Wednesday.
    const monday = new Date('2026-10-05T03:30:00Z');
    assert.deepEqual(reviewDeadlineAt(monday, 2), new Date('2026-10-07T18:29:59Z'));
  } finally {
    if (previous === undefined) delete process.env.REFUND_HOLIDAYS;
    else process.env.REFUND_HOLIDAYS = previous;
  }
});

test('nothing a buyer reads claims the money has already moved', () => {
  assert.match(REFUND_CUSTOMER_COPY.REQUESTED, /will be reviewed/i);
  assert.match(REFUND_CUSTOMER_COPY.APPROVED, /being sent back/i);
  assert.doesNotMatch(REFUND_CUSTOMER_COPY.APPROVED, /has paid you back|refund sent/i);
  assert.match(REFUND_CUSTOMER_COPY.REFUNDED, /paid you back/i);
  assert.doesNotMatch(REFUND_CUSTOMER_COPY.REJECTED, /money is on its way/i);
});

test('the actor vocabulary is closed', () => {
  const actors: CaseActor[] = ['CUSTOMER', 'STAFF'];
  assert.equal(actors.length, 2);
  assert.throws(
    // A crafted value must not be able to approve anything.
    () => assertRefundMove('REQUESTED', 'APPROVED', 'PROVIDER' as unknown as CaseActor),
    /customer cannot decide/i,
  );
});
