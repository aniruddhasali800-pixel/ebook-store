import 'server-only';
import { prisma } from '@/lib/db';
import { getPaymentProvider } from '@/lib/payments/registry';
import { transitionPayment } from '@/lib/payments/service';
import type { PaymentStatus } from '@/lib/payments/status';

/**
 * Provider notifications, applied to the payment state machine.
 *
 * A webhook is the only customer-facing path to PAID that does not involve a
 * human, so every check here fails closed:
 *   1. the signature is verified by the adapter itself, and an unverifiable
 *      payload never reaches the database;
 *   2. the order must exist and must have been *created* through this provider,
 *      so a notification for one method cannot settle an order placed with
 *      another;
 *   3. the amount must match the order to the paise, because a payload that
 *      names a real order is not thereby authorised to change its price;
 *   4. settlement still goes through `transitionPayment`, which re-checks the
 *      role table, demands a reference, and compares-and-swaps the previous
 *      status — so a replayed notification cannot settle twice.
 */

export type WebhookResult = {
  status: number;
  body: Record<string, unknown>;
};

function reject(status: number, error: string, message?: string): WebhookResult {
  return { status, body: message ? { error, message } : { error } };
}

export async function handleProviderWebhook(
  providerId: string,
  input: { rawBody: string; headers: Headers },
): Promise<WebhookResult> {
  const adapter = (() => {
    try {
      return getPaymentProvider(providerId);
    } catch {
      return null;
    }
  })();
  if (!adapter) return reject(404, 'unknown_provider');
  if (!adapter.parseWebhook) return reject(404, 'provider_has_no_webhook');

  const event = adapter.parseWebhook(input);
  if (!event) return reject(401, 'invalid_signature');

  if (event.outcome === 'IGNORE') return { status: 200, body: { ignored: true } };

  const order = await prisma.order.findUnique({
    where: { orderId: event.orderCode },
    select: {
      id: true,
      orderId: true,
      totalInPaise: true,
      paymentStatus: true,
      paymentMethod: true,
      channel: true,
    },
  });
  if (!order) return reject(404, 'unknown_order');
  if (order.paymentMethod !== adapter.id) {
    return reject(409, 'provider_mismatch', 'This order was placed with a different payment method.');
  }
  if (event.amountInPaise !== undefined && event.amountInPaise !== order.totalInPaise) {
    return reject(422, 'amount_mismatch', 'The notified amount does not match this order.');
  }

  const to = event.outcome as PaymentStatus;
  const current = order.paymentStatus as PaymentStatus;

  if (isTerminal(current)) {
    // Redelivery of what we already recorded is success, not a conflict: the
    // gateway keeps retrying until it sees 2xx.
    if (current === to) return { status: 200, body: { alreadyRecorded: true, paymentStatus: current } };
    return reject(
      409,
      'already_settled',
      `This order is already ${current}; a ${to} notification was not applied.`,
    );
  }

  if (to === 'PAID' && !event.reference) {
    return reject(422, 'missing_reference', 'A settlement notification must carry a transaction reference.');
  }

  const reason = `${adapter.label} reported ${to.toLowerCase()} (event ${event.eventId ?? 'unidentified'})`;
  try {
    await transitionPayment({
      orderId: order.id,
      to,
      actor: 'PROVIDER',
      reference: event.reference,
      reason,
    });
  } catch (error) {
    return reject(409, 'transition_rejected', error instanceof Error ? error.message : 'Transition rejected.');
  }

  return { status: 200, body: { applied: true, paymentStatus: to, orderCode: order.orderId } };
}

function isTerminal(status: PaymentStatus): boolean {
  return status === 'PAID' || status === 'FAILED' || status === 'CANCELLED';
}
