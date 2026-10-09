import { AppChrome } from '@/components/AppChrome';
import { VisitorBeacon } from '@/components/VisitorBeacon';
import { findOrderByToken } from '@/lib/orders';
import { CARD_HOSTED_PROVIDER } from '@/lib/payments/types';

export const dynamic = 'force-dynamic';

/**
 * Both storefronts share this page, so the promise under the receipt has to match
 * what the customer is actually waiting for — a file for a title, the counter for
 * a table order — and name the party that confirms it. `cardOrder` is read from
 * the order itself, not from the current till settings: a card order placed while
 * the gateway was switched on is still settled by that gateway after it is
 * switched off.
 */
function receiptFooter(channel: 'CAFE' | 'BOOKS', cardOrder: boolean): string {
  const confirmedBy = cardOrder
    ? 'by the payment gateway'
    : 'by someone at the shop, against their own statement';
  const unlocks = channel === 'BOOKS'
    ? 'Your download unlocks'
    : 'The order goes through';
  return `${unlocks} once the payment is confirmed ${confirmedBy}. Until then this page shows verification pending, never a false confirmation.`;
}

export default async function CheckoutLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const order = await findOrderByToken(token);

  return (
    <AppChrome
      brand={{ mark: 'S', label: 'Super AI Books', href: '/' }}
      footer={
        order
          ? receiptFooter(order.channel as 'CAFE' | 'BOOKS', order.paymentMethod === CARD_HOSTED_PROVIDER)
          : 'This page shows verification pending until the payment is confirmed. Nothing on it can mark a payment as paid on its own.'
      }
    >
      {children}
      <VisitorBeacon />
    </AppChrome>
  );
}
