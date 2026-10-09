'use server';

import { revalidatePath } from 'next/cache';
import { createOrder, findOrderByToken, OrderCreationError, type CartLine } from '@/lib/orders';
import { transitionPayment } from '@/lib/payments/service';

export type { CartLine };

export type ActionResult = { ok: boolean; message?: string };

/**
 * Called from the cart client component. Returns the payment page path so the
 * caller can navigate; throws redirect() when it can do the navigation itself.
 */
export async function createOrderAction(input: {
  cart: CartLine[];
  customerLabel?: string;
  note?: string;
  paymentMethod?: string;
}): Promise<{ ok: true; token: string } | { ok: false; message: string }> {
  try {
    const order = await createOrder(input);
    return { ok: true, token: order.token };
  } catch (error) {
    if (error instanceof OrderCreationError) return { ok: false, message: error.message };
    console.error('Order creation failed', error);
    return { ok: false, message: 'Could not create the order. Please try again.' };
  }
}

/**
 * "I've Completed Payment". This records a *claim* and moves the payment to
 * PAYMENT_VERIFICATION_PENDING. It cannot, by construction, produce PAID — the
 * state machine rejects a CUSTOMER actor for that transition.
 */
export async function claimPaymentCompletedAction(token: string): Promise<ActionResult> {
  const order = await findOrderByToken(token);
  if (!order) return { ok: false, message: 'Order not found.' };

  try {
    await transitionPayment({
      orderId: order.id,
      to: 'PAYMENT_VERIFICATION_PENDING',
      actor: 'CUSTOMER',
      actorId: order.customerId,
    });
  } catch (error) {
    return { ok: false, message: describe(error) };
  }

  revalidatePath(`/pay/${token}`);
  revalidatePath('/admin');
  revalidatePath('/dashboard');
  return { ok: true };
}

export async function cancelOrderAction(token: string): Promise<ActionResult> {
  const order = await findOrderByToken(token);
  if (!order) return { ok: false, message: 'Order not found.' };

  try {
    await transitionPayment({
      orderId: order.id,
      to: 'CANCELLED',
      actor: 'CUSTOMER',
      actorId: order.customerId,
      reason: 'Cancelled by customer',
    });
  } catch (error) {
    return { ok: false, message: describe(error) };
  }

  revalidatePath(`/pay/${token}`);
  return { ok: true };
}

function describe(error: unknown): string {
  if (error instanceof Error && 'name' in error) return error.message;
  return 'Something went wrong. Please try again.';
}
