import 'server-only';
import { randomBytes, randomInt } from 'node:crypto';
import { prisma } from '@/lib/db';
import { publishActivity } from '@/lib/activity';
import { formatINR, sumLineTotals } from '@/lib/money';
import { loadPayeeTarget, PaymentSettingsError } from '@/lib/settings';
import { getPaymentProvider, resolvePaymentProviderId } from '@/lib/payments/registry';
import type { PaymentIntent } from '@/lib/payments/types';

export class OrderCreationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OrderCreationError';
  }
}

export type CartLine = { menuItemId: string; quantity: number };

/** Short, human-quotable order code. Also used as the UPI `tr` reference. */
export async function generateOrderCode(): Promise<string> {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const candidate = String(randomInt(10_000, 100_000));
    const clash = await prisma.order.findUnique({ where: { orderId: candidate }, select: { id: true } });
    if (!clash) return candidate;
  }
  throw new OrderCreationError('Could not allocate an order code. Please try again.');
}

function validateCart(cart: readonly CartLine[]) {
  if (cart.length === 0) throw new OrderCreationError('Add at least one item to the order.');
  for (const line of cart) {
    if (!Number.isInteger(line.quantity) || line.quantity <= 0 || line.quantity > 99) {
      throw new OrderCreationError('Each item quantity must be between 1 and 99.');
    }
  }
}

export type CreatedOrder = {
  id: string;
  orderId: string;
  token: string;
  totalInPaise: number;
};

/**
 * Creates the order and its payment intent in one step.
 *
 * Prices come from the menu rows, never from the request body, so a tampered
 * cart cannot lower the payable amount. The payee VPA is frozen onto the order
 * at creation: editing Payment Settings later must not silently re-point an
 * invoice a customer is already looking at.
 *
 * `paymentMethod` is a customer-chosen string and is therefore resolved against
 * the registry — an unknown or disabled method falls back to the default rather
 * than letting a hand-built request settle through a provider the business has
 * not enabled.
 */
export async function createOrder(input: {
  cart: readonly CartLine[];
  customerLabel?: string;
  note?: string;
  paymentMethod?: unknown;
}): Promise<CreatedOrder & { intent: PaymentIntent }> {
  validateCart(input.cart);

  const menuItems = await prisma.menuItem.findMany({
    where: { id: { in: input.cart.map((line) => line.menuItemId) }, available: true },
  });
  const byId = new Map(menuItems.map((item) => [item.id, item]));

  const lines = input.cart.map((line) => {
    const item = byId.get(line.menuItemId);
    if (!item) throw new OrderCreationError('One of the selected items is no longer available.');
    return {
      menuItemId: item.id,
      name: item.name,
      unitPriceInPaise: item.priceInPaise,
      quantity: line.quantity,
      lineTotalInPaise: item.priceInPaise * line.quantity,
    };
  });

  const subtotalInPaise = sumLineTotals(lines);
  if (subtotalInPaise <= 0) throw new OrderCreationError('Order total must be greater than zero.');

  const payee = await loadPayeeTarget().catch((error: unknown) => {
    if (error instanceof PaymentSettingsError) throw new OrderCreationError(error.message);
    throw error;
  });

  const [orderId, token] = await Promise.all([generateOrderCode(), Promise.resolve(randomBytes(16).toString('base64url'))]);
  const customerLabel = (input.customerLabel ?? '').trim().slice(0, 60) || 'Counter guest';
  const paymentMethod = resolvePaymentProviderId(input.paymentMethod);

  const order = await prisma.order.create({
    data: {
      orderId,
      token,
      paymentMethod,
      paymentStatus: 'PENDING',
      status: 'AWAITING_PAYMENT',
      upiIdUsed: payee.vpa,
      currency: 'INR',
      subtotalInPaise,
      totalInPaise: subtotalInPaise,
      note: input.note?.trim().slice(0, 200) || null,
      customer: { create: { label: customerLabel } },
      items: { create: lines },
    },
    select: { id: true, orderId: true, token: true, totalInPaise: true },
  });

  const intent = await getPaymentProvider(paymentMethod).createIntent({
    orderCode: orderId,
    orderToken: token,
    amountInPaise: subtotalInPaise,
    currency: 'INR',
    payee: { vpa: payee.vpa, name: payee.payeeName },
    noteText: `Order #${orderId}`,
  });

  publishActivity({
    type: 'order',
    channel: 'CAFE',
    headline: `New order #${order.orderId}`,
    detail: `${formatINR(order.totalInPaise)} — ${lines.map((line) => `${line.quantity}× ${line.name}`).join(', ')}`,
    href: `/pay/${order.token}`,
  });

  return { ...order, intent };
}

export async function findOrderByToken(token: string) {
  return prisma.order.findUnique({
    where: { token },
    include: { items: true, customer: true, events: { orderBy: { createdAt: 'asc' } } },
  });
}

export async function listMenu() {
  return prisma.menuItem.findMany({
    where: { available: true },
    orderBy: [{ category: 'asc' }, { sortOrder: 'asc' }, { name: 'asc' }],
  });
}
