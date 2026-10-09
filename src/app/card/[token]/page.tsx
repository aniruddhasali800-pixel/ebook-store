import Link from 'next/link';
import { notFound } from 'next/navigation';
import { CardTestCheckout } from '@/components/CardTestCheckout';
import { findOrderByToken } from '@/lib/orders';
import { cardCheckoutEnabled } from '@/lib/payments/card-hosted';
import { CARD_HOSTED_PROVIDER } from '@/lib/payments/types';
import { formatINR } from '@/lib/money';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Card checkout' };

/**
 * The hosted-checkout page. In a live setup this URL belongs to the payment
 * gateway, not to this app; it exists here so the whole card path is walkable
 * before any merchant account is signed up.
 */
export default async function CardCheckoutPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const order = await findOrderByToken(token);
  if (!order || order.paymentMethod !== CARD_HOSTED_PROVIDER) notFound();

  if (!cardCheckoutEnabled()) {
    return (
      <div className="mx-auto w-full max-w-md space-y-4">
        <section className="rounded-2xl bg-white p-6 text-sm shadow-sm ring-1 ring-zinc-200">
          <h1 className="text-lg font-semibold text-zinc-900">Card checkout is not enabled</h1>
          <p className="mt-2 leading-relaxed text-zinc-600">
            This order was started as a card payment, but the simulated gateway is switched off on
            this deployment and no real merchant account is connected yet. Nothing has been
            charged.
          </p>
          <p className="mt-2 leading-relaxed text-zinc-600">
            Pay by UPI instead, or start the card flow with <code>CARD_TEST_MODE=1</code> set.
          </p>
          <Link
            href={`/pay/${order.token}`}
            className="mt-4 inline-block rounded-xl bg-zinc-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-zinc-800"
          >
            Back to order #{order.orderId}
          </Link>
        </section>
      </div>
    );
  }

  return (
    <CardTestCheckout
      token={order.token}
      orderCode={order.orderId}
      amountLabel={formatINR(order.totalInPaise)}
    />
  );
}
