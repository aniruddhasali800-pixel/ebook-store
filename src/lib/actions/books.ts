'use server';

import { redirect } from 'next/navigation';
import { createBookOrder } from '@/lib/books';
import { OrderCreationError } from '@/lib/orders';

export type BuyState = { ok: boolean; message?: string } | null;

/**
 * Creates the ebook order and sends the buyer straight to its payment page.
 *
 * Nothing here can mark a payment as made — createBookOrder only ever writes a
 * PENDING row, and the state machine keeps it that way until staff verify.
 */
export async function buyBookAction(previous: BuyState, formData: FormData): Promise<BuyState> {
  const bookId = String(formData.get('bookId') ?? '');
  if (!bookId) return { ok: false, message: 'No title was selected.' };

  let token: string;
  try {
    const order = await createBookOrder({
      bookId,
      paymentMethod: formData.get('paymentMethod'),
    });
    token = order.token;
  } catch (error) {
    if (error instanceof OrderCreationError) return { ok: false, message: error.message };
    console.error('Ebook order creation failed', error);
    return { ok: false, message: 'Could not start the order. Please try again.' };
  }

  redirect(`/pay/${token}`);
}
