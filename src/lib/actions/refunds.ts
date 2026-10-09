'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/db';
import { extendSession, requireStaff } from '@/lib/auth/session';
import { CaseStateMachineError } from '@/lib/case-log';
import { publishActivity } from '@/lib/activity';
import { formatINR } from '@/lib/money';
import {
  moveRefund,
  REFUND_REFUSALS,
  refundEligibility,
  reviewDeadlineAt,
  type RefundStatus,
} from '@/lib/refunds';
import type { StaffFormState } from '@/lib/actions/staff';

const DECISIONS: Record<string, RefundStatus> = {
  approve: 'APPROVED',
  reject: 'REJECTED',
  refunded: 'REFUNDED',
};

/**
 * A buyer asking for their money back.
 *
 * The order token is the credential — the same unguessable one the payment page
 * uses — because the numeric order code is public on receipts and statements.
 * Eligibility is computed here rather than trusted from the page, so editing the
 * form cannot stretch the 24-hour window or re-open a closed refund.
 */
export async function requestRefundAction(
  _state: StaffFormState,
  formData: FormData,
): Promise<StaffFormState> {
  const token = String(formData.get('token') ?? '');
  const reason = String(formData.get('reason') ?? '').trim();
  const payoutVpa = String(formData.get('payoutVpa') ?? '').trim().slice(0, 60);

  if (reason.length < 12) {
    return { ok: false, message: 'Tell the shop what went wrong, in at least a sentence.' };
  }
  if (payoutVpa && !/^[\w.-]{2,256}@[\w.-]{2,256}$/.test(payoutVpa)) {
    return { ok: false, message: 'That does not look like a UPI ID. Leave it blank to be paid back to the account you paid from.' };
  }

  const order = await prisma.order.findUnique({
    where: { token },
    select: {
      id: true,
      orderId: true,
      token: true,
      channel: true,
      paymentStatus: true,
      paidAt: true,
      totalInPaise: true,
      refunds: { select: { status: true }, orderBy: { requestedAt: 'desc' } },
    },
  });
  if (!order) return { ok: false, message: 'That order could not be found.' };

  const eligibility = refundEligibility(order);
  if (!eligibility.eligible) {
    return { ok: false, message: REFUND_REFUSALS[eligibility.reason] };
  }

  await prisma.refundRequest.create({
    data: {
      orderId: order.id,
      reason: reason.slice(0, 1200),
      amountInPaise: order.totalInPaise,
      payoutVpa: payoutVpa || null,
      status: 'REQUESTED',
      reviewDueAt: reviewDeadlineAt(new Date()),
      paidAtSnapshot: eligibility.paidAt,
    },
  });

  await publishActivity({
    type: 'refund',
    channel: order.channel,
    headline: `Refund requested on #${order.orderId}`,
    detail: `${formatINR(order.totalInPaise)} — ${reason.slice(0, 90)}`,
    href: order.channel === 'BOOKS' ? '/dashboard/refunds' : '/admin/refunds',
  });

  revalidatePath(`/pay/${order.token}`);
  revalidatePath(order.channel === 'BOOKS' ? '/dashboard/refunds' : '/admin/refunds');

  return {
    ok: true,
    message: 'Your request has reached the shop. It will be reviewed within two working days, and you can watch this page for the answer.',
  };
}

/** Staff decision: approve, refuse, or confirm the money actually went back. */
export async function decideRefundAction(
  _state: StaffFormState,
  formData: FormData,
): Promise<StaffFormState> {
  let staff;
  try {
    staff = await requireStaff();
  } catch {
    return { ok: false, message: 'Your session has expired. Sign in again.' };
  }
  await extendSession(staff);

  const refundId = String(formData.get('refundId') ?? '');
  const to = DECISIONS[String(formData.get('decision') ?? '')];
  const note = String(formData.get('note') ?? '').trim();
  const reference = String(formData.get('payoutReference') ?? '').trim();

  if (!refundId || !to) return { ok: false, message: 'Choose an outcome for this refund.' };

  const refund = await prisma.refundRequest.findUnique({
    where: { id: refundId },
    select: {
      id: true,
      status: true,
      amountInPaise: true,
      order: { select: { id: true, orderId: true, token: true, channel: true } },
    },
  });
  if (!refund || !refund.order) return { ok: false, message: 'That refund request no longer exists.' };

  // The dashboard is scoped by channel, so the action has to be too — otherwise
  // a books staffer could decide a cafe refund through a crafted form.
  const expectedChannel = String(formData.get('channel') ?? '');
  if (expectedChannel !== refund.order.channel) {
    return { ok: false, message: 'That refund belongs to the other storefront’s queue.' };
  }
  if (to === 'REFUNDED' && !reference) {
    return { ok: false, message: 'Enter the transfer reference the customer can look up. Nothing is marked paid back without it.' };
  }

  try {
    await moveRefund({
      refundId,
      to,
      actor: 'STAFF',
      staffId: staff.id,
      note: note || undefined,
      payoutReference: reference || undefined,
    });
  } catch (error) {
    if (error instanceof CaseStateMachineError) return { ok: false, message: error.message };
    console.error('Refund decision failed', error);
    return { ok: false, message: 'Could not record that decision. Try again.' };
  }

  if (to === 'REFUNDED') {
    await publishActivity({
      type: 'refund',
      channel: refund.order.channel,
      headline: `Refund paid back on #${refund.order.orderId}`,
      detail: `${formatINR(refund.amountInPaise)} — reference ${reference}`,
      href: `/pay/${refund.order.token}`,
    });
  }

  revalidatePath('/dashboard/refunds');
  revalidatePath('/admin/refunds');
  revalidatePath(`/pay/${refund.order.token}`);

  return { ok: true, message: DECISION_COPY[to] };
}

const DECISION_COPY: Record<RefundStatus, string> = {
  REQUESTED: '',
  APPROVED: 'Approved. Send the money back from your own UPI or bank app, then mark it paid here.',
  REFUNDED: 'Recorded as paid back. The buyer sees it on their receipt page now.',
  REJECTED: 'Refused. Write the reason — the buyer sees it, and this is what a complaint will quote.',
};
