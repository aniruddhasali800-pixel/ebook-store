import 'server-only';
import { prisma } from '@/lib/db';
import {
  assertRefundMove,
  CaseStateMachineError,
  type CaseActor,
  type RefundStatus,
} from '@/lib/case-rules';

export {
  assertRefundMove,
  canMoveRefund,
  CaseStateMachineError,
  isWorkingDay,
  REFUND_CUSTOMER_COPY,
  REFUND_REFUSALS,
  REFUND_REQUEST_WINDOW_HOURS,
  REFUND_REVIEW_WORKING_DAYS,
  refundCustomerCopy,
  refundEligibility,
  reviewDeadlineAt,
  shopDayKey,
  type CaseActor,
  type RefundEligibility,
  type RefundRefusal,
} from '@/lib/case-rules';
export { REFUND_STATUS_LABELS, REFUND_STATUSES, type RefundStatus } from '@/lib/case-status';

/**
 * The database half of the refund rules. The rules themselves — the window, the
 * working-day clock, who may move a request to which status — are in
 * `src/lib/case-rules.ts`, where they can be tested without a database.
 */

/**
 * The only write path for a refund's status. Compare-and-swap on the row's previous
 * status, so two staff members clicking the same decision cannot both record a
 * payout, and the audit row is written beside it.
 */
export async function moveRefund(input: {
  refundId: string;
  to: RefundStatus;
  actor: CaseActor;
  staffId?: string;
  note?: string;
  payoutReference?: string;
}): Promise<{ from: RefundStatus; to: RefundStatus }> {
  const current = await prisma.refundRequest.findUnique({
    where: { id: input.refundId },
    select: { id: true, orderId: true, status: true },
  });
  if (!current) throw new CaseStateMachineError('That refund request no longer exists.');
  const from = current.status as RefundStatus;
  assertRefundMove(from, input.to, input.actor);

  if (input.to === 'REFUNDED' && !input.payoutReference?.trim()) {
    throw new CaseStateMachineError(
      'Marking a refund paid back needs the transfer reference the customer can look up — a UTR or bank reference.',
    );
  }

  const claim = await prisma.refundRequest.updateMany({
    where: { id: input.refundId, status: from },
    data: {
      status: input.to,
      ...(input.actor === 'STAFF' ? { reviewedAt: new Date(), reviewedById: input.staffId ?? null } : {}),
      ...(input.note ? { decisionNote: input.note.slice(0, 900) } : {}),
      ...(input.payoutReference ? { payoutReference: input.payoutReference.trim().slice(0, 120) } : {}),
    },
  });
  if (claim.count !== 1) {
    throw new CaseStateMachineError('Someone else updated this refund just now. Reload it before deciding again.');
  }

  await prisma.caseEvent.create({
    data: {
      kind: 'REFUND',
      refundId: input.refundId,
      actorType: input.actor,
      actorId: input.staffId ?? null,
      fromStatus: from,
      toStatus: input.to,
      note: input.payoutReference
        ? `${input.note ?? ''} payout ${input.payoutReference.trim().slice(0, 120)}`.trim()
        : (input.note?.slice(0, 900) ?? null),
    },
  });

  // A settled refund is part of the order's story too.
  await prisma.paymentEvent.create({
    data: {
      orderId: current.orderId,
      type: 'REFUND_' + input.to,
      actorType: input.actor,
      actorId: input.staffId ?? null,
      reference: input.payoutReference?.trim().slice(0, 120) ?? null,
      detail: input.note?.slice(0, 900) ?? null,
    },
  });

  return { from, to: input.to };
}
