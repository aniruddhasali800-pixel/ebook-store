import { notFound } from 'next/navigation';
import { ComplaintBox } from '@/components/ComplaintBox';
import { PaymentReceipt } from '@/components/PaymentReceipt';
import { RefundRequest } from '@/components/RefundRequest';
import { complaintViews, refundPanelProps } from '@/lib/cases';
import { findOrderByToken } from '@/lib/orders';
import { listOrderDownloads } from '@/lib/books';
import { buildIntentForOrder } from '@/lib/payments/service';
import { cardCheckoutEnabled } from '@/lib/payments/card-hosted';
import { payWindowAt } from '@/lib/pay/window';
import { maskVpa } from '@/lib/crypto';
import { formatINR } from '@/lib/money';
import { stampDateTime } from '@/lib/shop-clock';
import type { OrderChannel, PaymentStatus as PaymentStatusValue } from '@/lib/payments/status';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Pay for your order' };

export default async function PayPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const order = await findOrderByToken(token);
  if (!order) notFound();

  // The intent is rebuilt from the payee frozen on the order, so the QR always
  // matches the invoice the customer was first shown. Card orders get the
  // gateway's checkout link from the same call.
  const intent = await buildIntentForOrder(order);
  const channel = order.channel as OrderChannel;
  const payWindow = payWindowAt(order.createdAt, new Date());
  // Resolved up front and revealed by the client the moment the poll reports
  // PAID, so nobody has to refresh to get their file. The route still refuses
  // anything that is not settled.
  const downloads =
    channel === 'BOOKS' ? await listOrderDownloads(order.id) : [];

  // Read together with the order so the receipt shows the same refund status the
  // staff queue is looking at, without the customer having to ask.
  const [refundPanel, complaints] = await Promise.all([
    refundPanelProps({
      id: order.id,
      token: order.token,
      paymentStatus: order.paymentStatus,
      paidAt: order.paidAt,
      totalInPaise: order.totalInPaise,
    }),
    complaintViews({ orderId: order.id }),
  ]);

  return (
    <div className="space-y-6">
      <PaymentReceipt
        token={order.token}
        orderCode={order.orderId}
        amountLabel={formatINR(order.totalInPaise)}
        payeeLabel={maskVpa(intent.payeeVpa)}
        upiUri={intent.upiUri ?? ''}
        qrDataUrl={intent.qrDataUrl ?? ''}
        providerId={order.paymentMethod}
        checkoutUrl={intent.checkoutUrl ?? ''}
        testMode={order.paymentMethod === 'CARD_HOSTED' && cardCheckoutEnabled()}
        initialPaymentStatus={order.paymentStatus as PaymentStatusValue}
        initialOrderStatus={order.status}
        channel={channel}
        windowClosesAtMs={payWindow.closesAt.getTime()}
        windowRemainingMs={payWindow.remainingMs}
        downloads={downloads.map((file) => ({
          bookId: file.bookId,
          title: file.title,
          format: file.format,
        }))}
      />

      <section className="mx-auto w-full max-w-md rounded-2xl bg-white p-5 shadow-sm ring-1 ring-zinc-200">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
          Order summary
        </h2>
        <ul className="mt-3 space-y-2 text-sm">
          {order.items.map((item) => (
            <li key={item.id} className="flex justify-between gap-3">
              <span className="min-w-0 truncate text-zinc-700">
                {item.name}
                <span className="text-zinc-400"> × {item.quantity}</span>
              </span>
              <span className="tabular-nums text-zinc-900">
                {formatINR(item.lineTotalInPaise)}
              </span>
            </li>
          ))}
        </ul>
        <div className="mt-3 flex justify-between border-t border-dashed border-zinc-200 pt-3 text-sm font-semibold">
          <span className="text-zinc-700">Total payable</span>
          <span className="tabular-nums text-zinc-900">{formatINR(order.totalInPaise)}</span>
        </div>
        {order.note ? (
          <p className="mt-3 text-xs text-zinc-500">Note: {order.note}</p>
        ) : null}
        <p className="mt-3 text-xs text-zinc-500">
          Order placed {stampDateTime(order.createdAt)}
        </p>
      </section>

      <div className="mx-auto w-full max-w-md space-y-4">
        <RefundRequest {...refundPanel} />
        <ComplaintBox token={order.token} existing={complaints} />
      </div>
    </div>
  );
}
