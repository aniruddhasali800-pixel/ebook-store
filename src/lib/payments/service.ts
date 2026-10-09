import 'server-only';
import { prisma } from '@/lib/db';
import { publishActivity } from '@/lib/activity';
import { consumeStockForPaidOrder } from '@/lib/inventory/stock';
import { formatINR } from '@/lib/money';
import { loadPayeeTarget } from '@/lib/settings';
import { getPaymentProvider } from '@/lib/payments/registry';
import type { PaymentIntent } from '@/lib/payments/types';
import {
  assertTransition,
  orderStatusForPaymentStatus,
  type ActorType,
  type OrderChannel,
  type OrderStatus,
  type PaymentStatus,
} from '@/lib/payments/status';

export class PaymentServiceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PaymentServiceError';
  }
}

/** Statuses an order row can hold; validated at the boundary of this module. */
function asPaymentStatus(value: string): PaymentStatus {
  return value as PaymentStatus;
}

function asOrderStatus(value: string): OrderStatus {
  return value as OrderStatus;
}

type TransitionInput = {
  orderId: string;
  to: PaymentStatus;
  actor: ActorType;
  actorId?: string;
  reference?: string;
  reason?: string;
};

/**
 * The only path that may change a payment status.
 *
 * Guards, in order:
 *  1. `assertTransition` — role-aware state machine (a CUSTOMER can never reach PAID).
 *  2. reference required to settle.
 *  3. a PROVIDER actor may only settle through an adapter whose `canSettle` is
 *     true, i.e. one that actually observed the money.
 *  4. the write is compare-and-swap on the previous status, so two staff members
 *     verifying the same order at once cannot both "win".
 */
export async function transitionPayment(input: TransitionInput) {
  const order = await prisma.order.findUnique({ where: { id: input.orderId }, select: { id: true, orderId: true, token: true, totalInPaise: true, paymentStatus: true, status: true, channel: true, paymentMethod: true, paymentReference: true, verifiedById: true, paidAt: true } });
  if (!order) throw new PaymentServiceError('Order not found.');

  const from = asPaymentStatus(order.paymentStatus);
  const to = input.to;
  const transition = assertTransition(from, to, input.actor);

  const reference = input.reference?.trim();
  if (transition.requiresReference && !reference) {
    throw new PaymentServiceError('Enter the bank reference (UTR) of the matched transaction before marking this order as paid.');
  }

  if (to === 'PAID' && input.actor === 'PROVIDER') {
    const provider = getPaymentProvider(order.paymentMethod);
    if (!provider.canSettle) {
      throw new PaymentServiceError(`${provider.label} cannot confirm settlement on its own; staff verification is required.`);
    }
  }

  const nextStatus = orderStatusForPaymentStatus(
    asOrderStatus(order.status),
    to,
    order.channel as OrderChannel,
  );
  const now = new Date();

  const updated = await prisma.order.updateMany({
    where: { id: order.id, paymentStatus: from },
    data: {
      paymentStatus: to,
      status: nextStatus,
      paymentReference: reference ?? order.paymentReference,
      paidAt: to === 'PAID' ? now : order.paidAt,
      verifiedById: input.actor === 'STAFF' ? (input.actorId ?? null) : order.verifiedById,
    },
  });

  if (updated.count !== 1) {
    throw new PaymentServiceError('This order was updated by someone else. Reload the list before verifying again.');
  }

  await prisma.paymentEvent.create({
    data: {
      orderId: order.id,
      type: input.actor === 'CUSTOMER' ? 'CONFIRMED_BY_CUSTOMER' : 'STATUS_CHANGED',
      actorType: input.actor,
      actorId: input.actorId ?? null,
      fromStatus: from,
      toStatus: to,
      reference: reference ?? null,
      detail: input.reason ? JSON.stringify({ reason: input.reason }) : null,
    },
  });

  // Stock moves only here, and only into PAID: a claim, a pending order and an
  // expired payment window all leave the shelf untouched, because none of them is
  // evidence anybody paid. A failure in this write must never undo the settlement
  // above — the money is the fact, the count is bookkeeping, so it is logged and
  // the admin sees the gap on the inventory page instead.
  if (to === 'PAID' && from !== 'PAID') {
    try {
      await consumeStockForPaidOrder({ id: order.id, orderId: order.orderId }, input.actorId ?? null);
    } catch (error) {
      console.error('Stock was not updated for a settled order', order.orderId, error);
      await publishActivity({
        type: 'stock',
        channel: order.channel,
        headline: `Stock count is now wrong for order #${order.orderId}`,
        detail: 'The payment is settled and untouched. Count the shelf to reconcile.',
        href: '/admin/inventory',
      });
    }
  }

  // The staff dashboards watch this rather than re-polling: a claim or a
  // settlement should be visible the second it happens.
  //
  // A settlement gets its own event type because the dashboards make a different
  // noise for it than for a claim, and because "Payment failed" as a headline reads
  // like a fact about the bank when it is a decision a staff member just recorded.
  publishActivity(
    to === 'PAYMENT_VERIFICATION_PENDING' && input.actor === 'CUSTOMER'
      ? {
          type: 'claim',
          channel: order.channel,
          headline: `Buyer says they paid #${order.orderId}`,
          detail: `${formatINR(order.totalInPaise)} — awaiting verification`,
          href: order.channel === 'BOOKS' ? '/dashboard' : '/admin',
        }
      : to === 'PAID'
        ? {
            type: 'settled',
            channel: order.channel,
            headline: `Paid on #${order.orderId}`,
            detail: `${formatINR(order.totalInPaise)}${reference ? ` · reference ${reference}` : ''}`,
            href: `/pay/${order.token}`,
          }
        : {
            type: 'payment',
            channel: order.channel,
            headline: `#${order.orderId} marked ${to.toLowerCase()} by ${input.actor.toLowerCase()}`,
            detail: `${formatINR(order.totalInPaise)}${reference ? ` · ${reference}` : ''}`,
            href: `/pay/${order.token}`,
          },
  );

  return prisma.order.findUnique({
    where: { id: order.id },
    include: { items: true, customer: true, events: { orderBy: { createdAt: 'desc' } }, verifiedBy: true },
  });
}

/**
 * Rebuilds the payment intent for the customer page.
 *
 * Uses the VPA frozen on the order, so an outstanding invoice always points at
 * the account the customer was first shown.
 */
export async function buildIntentForOrder(order: {
  orderId: string;
  token: string;
  totalInPaise: number;
  upiIdUsed: string | null;
  paymentMethod: string;
}): Promise<PaymentIntent> {
  const payee = await loadPayeeTarget();
  const provider = getPaymentProvider(order.paymentMethod);
  return provider.createIntent({
    orderCode: order.orderId,
    orderToken: order.token,
    amountInPaise: order.totalInPaise,
    currency: 'INR',
    payee: {
      vpa: order.upiIdUsed ?? payee.vpa,
      name: payee.payeeName,
    },
    noteText: `Order #${order.orderId}`,
  });
}

/**
 * Fulfilment ladder, deliberately separate from the payment ladder: preparing
 * an order is a different decision than being paid for it, and only a PAID
 * payment opens it (see orderStatusForPaymentStatus).
 */
const ORDER_LIFECYCLE: Record<OrderStatus, readonly OrderStatus[]> = {
  AWAITING_PAYMENT: [],
  IN_KITCHEN: ['READY'],
  READY: ['COMPLETED'],
  COMPLETED: [],
  CANCELLED: [],
};

export async function advanceOrderStatus(orderId: string, next: OrderStatus) {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: { id: true, status: true, paymentStatus: true },
  });
  if (!order) throw new PaymentServiceError('Order not found.');

  const current = asOrderStatus(order.status);
  if (!ORDER_LIFECYCLE[current].includes(next)) {
    throw new PaymentServiceError(`An order marked ${current} cannot move to ${next}.`);
  }
  if (asPaymentStatus(order.paymentStatus) !== 'PAID') {
    throw new PaymentServiceError('Only orders with a confirmed payment can be prepared.');
  }

  await prisma.order.update({ where: { id: orderId }, data: { status: next } });
  return prisma.order.findUnique({ where: { id: orderId }, include: { items: true, customer: true } });
}

/** `channel` keeps the cafe verification queue and the book queue separate. */
export async function listOrdersByPaymentStatus(
  statuses: PaymentStatus[],
  limit = 200,
  channel?: OrderChannel,
) {
  return prisma.order.findMany({
    where: { paymentStatus: { in: statuses }, ...(channel ? { channel } : {}) },
    orderBy: { updatedAt: 'desc' },
    take: limit,
    include: { items: true, customer: true, verifiedBy: true },
  });
}

/** Kitchen sees cafe orders in the fulfilment ladder only; unpaid ones never appear. */
export async function listKitchenOrders() {
  return prisma.order.findMany({
    where: { channel: 'CAFE', status: { in: ['IN_KITCHEN', 'READY'] } },
    orderBy: { paidAt: 'asc' },
    include: { items: true, customer: true },
  });
}

export async function countOrdersByPaymentStatus(channel?: OrderChannel) {
  const grouped = await prisma.order.groupBy({
    by: ['paymentStatus'],
    where: channel ? { channel } : undefined,
    _count: { _all: true },
  });
  return grouped.reduce<Record<string, number>>((counts, row) => {
    counts[row.paymentStatus] = row._count._all;
    return counts;
  }, {});
}

/** Settled money only — pending and self-claimed orders are never counted. */
export async function sumPaidInPaise(channel?: OrderChannel) {
  const total = await prisma.order.aggregate({
    where: { paymentStatus: 'PAID', ...(channel ? { channel } : {}) },
    _sum: { totalInPaise: true },
  });
  return total._sum.totalInPaise ?? 0;
}
