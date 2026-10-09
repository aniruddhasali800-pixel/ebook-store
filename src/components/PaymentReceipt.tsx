'use client';

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { UpiQrCode } from '@/components/UpiQrCode';
import { PaymentStatus } from '@/components/PaymentStatus';
import { claimPaymentCompletedAction, cancelOrderAction } from '@/lib/actions/customer';
import { CARD_HOSTED_PROVIDER } from '@/lib/payments/types';
import { PAY_WINDOW_MINUTES, formatPayWindow } from '@/lib/pay/window';
import {
  customerCopyFor,
  TERMINAL_PAYMENT_STATUSES,
  type OrderChannel,
  type PaymentStatus as PaymentStatusValue,
} from '@/lib/payments/status';

type Props = {
  token: string;
  orderCode: string;
  amountLabel: string;
  /** Masked only — the full payee VPA stays on the server. */
  payeeLabel: string;
  upiUri: string;
  qrDataUrl: string;
  /** Adapter id this order was created with; decides which instructions to show. */
  providerId: string;
  /** Hosted checkout link for card orders. Empty when there is none. */
  checkoutUrl?: string;
  /** True while the simulated gateway is enabled, so the UI can say so loudly. */
  testMode?: boolean;
  initialPaymentStatus: PaymentStatusValue;
  initialOrderStatus: string;
  channel?: OrderChannel;
  /** When the shop's payment window closes, and the time left at page render. */
  windowClosesAtMs: number;
  windowRemainingMs: number;
  /**
   * Ebook files this order unlocks. Safe to render before payment settles: the
   * download route re-checks PAID and refuses anything else.
   */
  downloads?: { bookId: string; title: string; format: string }[];
};

export function PaymentReceipt({
  token,
  orderCode,
  amountLabel,
  payeeLabel,
  upiUri,
  qrDataUrl,
  providerId,
  checkoutUrl = '',
  testMode = false,
  initialPaymentStatus,
  initialOrderStatus,
  channel = 'CAFE',
  windowClosesAtMs,
  windowRemainingMs,
  downloads = [],
}: Props) {
  const [paymentStatus, setPaymentStatus] = useState<PaymentStatusValue>(initialPaymentStatus);
  const [orderStatus, setOrderStatus] = useState(initialOrderStatus);
  const [busy, setBusy] = useState<'claim' | 'cancel' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const isCoarsePointer = useCoarsePointer();
  const settled = TERMINAL_PAYMENT_STATUSES.includes(paymentStatus);
  const byCard = providerId === CARD_HOSTED_PROVIDER;

  const run = useCallback(
    async (kind: 'claim' | 'cancel') => {
      setBusy(kind);
      setError(null);
      const result =
        kind === 'claim'
          ? await claimPaymentCompletedAction(token)
          : await cancelOrderAction(token);
      if (result.ok) {
        setPaymentStatus(kind === 'claim' ? 'PAYMENT_VERIFICATION_PENDING' : 'CANCELLED');
      } else {
        setError(result.message ?? 'Something went wrong. Please try again.');
      }
      setBusy(null);
    },
    [token],
  );

  /**
   * Nothing on this page can tell the customer that money arrived. A UPI device
   * cannot observe the bank transfer at all, and a card result only ever reaches
   * us from the gateway's webhook — so both wait on the same status feed, which
   * is written by staff verification or by that webhook.
   */
  useEffect(() => {
    if (settled) return;
    let cancelled = false;

    const timer = setInterval(async () => {
      try {
        const response = await fetch(`/api/pay/${token}/status`, { cache: 'no-store' });
        if (!response.ok || cancelled) return;
        const payload = (await response.json()) as {
          paymentStatus: PaymentStatusValue;
          orderStatus: string;
        };
        if (cancelled) return;
        setPaymentStatus(payload.paymentStatus);
        setOrderStatus(payload.orderStatus);
      } catch {
        // Transient network noise: keep the last known state and try again.
      }
    }, 5000);

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [settled, token]);

  const copy = customerCopyFor(paymentStatus, channel);
  const awaitingPayment = paymentStatus === 'PENDING' || paymentStatus === 'PAYMENT_VERIFICATION_PENDING';

  return (
    <div className="mx-auto w-full max-w-md space-y-5">
      {byCard && testMode ? (
        <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm leading-relaxed text-amber-900 ring-1 ring-amber-300">
          <span className="font-semibold">Simulated gateway.</span> No card is charged and no money
          moves. Approving on the checkout page posts a signed notification to this site exactly as
          a real payment provider would.
        </p>
      ) : null}

      <section className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-zinc-200">
        <header className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm text-zinc-500">Order</p>
            <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">#{orderCode}</h1>
          </div>
          <PaymentStatus status={paymentStatus} />
        </header>

        <dl className="mt-5 space-y-2 border-y border-dashed border-zinc-200 py-4 text-sm">
          <div className="flex justify-between">
            <dt className="text-zinc-500">{byCard ? 'Paid to' : 'Pay to'}</dt>
            <dd className="font-medium text-zinc-900">{byCard ? 'This shop' : payeeLabel}</dd>
          </div>
          <div className="flex justify-between text-base">
            <dt className="font-medium text-zinc-700">Total</dt>
            <dd className="font-semibold tabular-nums text-zinc-900">{amountLabel}</dd>
          </div>
        </dl>

        {paymentStatus === 'PENDING' ? (
          <PayWindow closesAtMs={windowClosesAtMs} initialRemainingMs={windowRemainingMs} />
        ) : null}

        {awaitingPayment && byCard ? (
          <div className="mt-5 space-y-2">
            <a
              href={checkoutUrl || `/card/${token}`}
              className="flex w-full items-center justify-center rounded-xl bg-zinc-900 px-4 py-3 text-sm font-semibold text-white transition hover:bg-zinc-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-900"
            >
              {testMode ? 'Open the simulated card checkout' : 'Open card checkout'}
            </a>
            <button
              type="button"
              onClick={() => run('claim')}
              disabled={busy !== null || paymentStatus !== 'PENDING'}
              className="flex w-full items-center justify-center rounded-xl border border-zinc-300 bg-white px-4 py-3 text-sm font-semibold text-zinc-800 transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:bg-zinc-50 disabled:text-zinc-400"
            >
              {busy === 'claim' ? 'Recording…' : "I've Completed Payment"}
            </button>
            <p className="pt-1 text-center text-sm leading-relaxed text-zinc-600">
              The card form lives on the gateway&apos;s own page. This site never asks for a card
              number, an expiry or a CVV.
            </p>
          </div>
        ) : null}

        {awaitingPayment && !byCard ? (
          <>
            <div className="mt-5 flex flex-col items-center gap-3">
              <UpiQrCode
                dataUrl={qrDataUrl}
                alt={`UPI payment QR code for order ${orderCode}, amount ${amountLabel}`}
              />
              <p className="text-center text-sm text-zinc-600">
                Scan with Google Pay, PhonePe, Paytm or another UPI app. The amount is
                prefilled at <span className="font-medium text-zinc-900">{amountLabel}</span>.
              </p>
            </div>

            <div className="mt-5 space-y-2">
              <a
                href={upiUri}
                className="flex w-full items-center justify-center rounded-xl bg-zinc-900 px-4 py-3 text-sm font-semibold text-white transition hover:bg-zinc-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-900"
              >
                {isCoarsePointer ? 'Open UPI App' : 'Pay with UPI App'}
              </a>
              <button
                type="button"
                onClick={() => run('claim')}
                disabled={busy !== null || paymentStatus !== 'PENDING'}
                className="flex w-full items-center justify-center rounded-xl border border-zinc-300 bg-white px-4 py-3 text-sm font-semibold text-zinc-800 transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:bg-zinc-50 disabled:text-zinc-400"
              >
                {busy === 'claim' ? 'Recording…' : "I've Completed Payment"}
              </button>
            </div>
          </>
        ) : null}

        <StatusPanel
          paymentStatus={paymentStatus}
          orderStatus={orderStatus}
          copy={copy}
          amountLabel={amountLabel}
        />

        {paymentStatus === 'PAID' && downloads.length > 0 ? (
          <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
            <p className="text-xs font-semibold tracking-wider text-emerald-800 uppercase">
              Your download
            </p>
            <ul className="mt-2.5 space-y-2">
              {downloads.map((item) => (
                <li key={item.bookId}>
                  <a
                    href={`/api/dl/${token}/${item.bookId}`}
                    className="flex items-center justify-between gap-3 rounded-lg bg-white px-3 py-2.5 text-sm font-medium text-zinc-900 ring-1 ring-emerald-200 transition hover:ring-emerald-400"
                  >
                    <span className="min-w-0 truncate">{item.title}</span>
                    <span className="shrink-0 text-xs text-emerald-700">{item.format} ↓</span>
                  </a>
                </li>
              ))}
            </ul>
            <p className="mt-2.5 text-xs leading-relaxed text-emerald-800/80">
              This link belongs to your order. Keep the page bookmarked — there is no account to
              sign back into.
            </p>
          </div>
        ) : null}

        {error ? (
          <p role="alert" className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700 ring-1 ring-rose-200">
            {error}
          </p>
        ) : null}

        {paymentStatus === 'PENDING' ? (
          <div className="mt-4 text-center">
            <button
              type="button"
              onClick={() => run('cancel')}
              disabled={busy !== null}
              className="text-sm text-zinc-500 underline underline-offset-4 hover:text-zinc-700 disabled:opacity-50"
            >
              Cancel this order
            </button>
          </div>
        ) : null}
      </section>

      {byCard ? (
        <p className="px-2 text-center text-xs leading-relaxed text-zinc-500">
          Card payments are confirmed by the payment gateway, which posts the transaction and its
          reference to this site. <span className="font-medium text-zinc-700">No screen in this
          flow can mark a payment as made on its own</span> — not this page, and not the checkout
          page returning to it.
        </p>
      ) : (
        <p className="px-2 text-center text-xs leading-relaxed text-zinc-500">
          This is a direct UPI transfer to the merchant, not a gateway payment. The business
          confirms each payment by matching it against their bank statement, so{' '}
          <span className="font-medium text-zinc-700">
            tapping &ldquo;I&apos;ve Completed Payment&rdquo; never marks an order as paid
          </span>
          . Keep the reference number your UPI app shows you.
        </p>
      )}

      {!byCard ? (
        <details className="rounded-xl bg-white p-4 text-sm text-zinc-600 shadow-sm ring-1 ring-zinc-200">
          <summary className="cursor-pointer font-medium text-zinc-800">
            Having trouble with the QR code?
          </summary>
          <div className="mt-3 space-y-3">
            <p>Copy the payment link and paste it into your UPI app, or use it on a phone.</p>
            <div className="flex gap-2">
              <code className="flex-1 overflow-x-auto rounded-lg bg-zinc-50 px-3 py-2 text-xs text-zinc-700 ring-1 ring-zinc-200">
                {upiUri}
              </code>
              <CopyButton value={upiUri} />
            </div>
          </div>
        </details>
      ) : null}
    </div>
  );
}

function StatusPanel({
  paymentStatus,
  orderStatus,
  copy,
  amountLabel,
}: {
  paymentStatus: PaymentStatusValue;
  orderStatus: string;
  copy: string;
  amountLabel: string;
}) {
  if (paymentStatus === 'PENDING') return null;

  const tone =
    paymentStatus === 'PAID'
      ? 'bg-emerald-50 text-emerald-900 ring-emerald-200'
      : paymentStatus === 'PAYMENT_VERIFICATION_PENDING'
        ? 'bg-amber-50 text-amber-900 ring-amber-200'
        : 'bg-zinc-100 text-zinc-700 ring-zinc-200';

  const title =
    paymentStatus === 'PAID'
      ? 'Payment confirmed'
      : paymentStatus === 'PAYMENT_VERIFICATION_PENDING'
        ? 'Payment submitted'
        : paymentStatus === 'FAILED'
          ? 'Payment not verified'
          : 'Order cancelled';

  return (
    <div aria-live="polite" className={`mt-5 rounded-xl px-4 py-3 text-sm ring-1 ring-inset ${tone}`}>
      <p className="font-semibold">{title}</p>
      <p className="mt-1 leading-relaxed">{copy}</p>
      {paymentStatus === 'PAYMENT_VERIFICATION_PENDING' ? (
        <p className="mt-2 text-xs opacity-80">
          Amount claimed: {amountLabel}. This page updates on its own once the business
          confirms the transfer.
        </p>
      ) : null}
      {paymentStatus === 'PAID' && orderStatus !== 'AWAITING_PAYMENT' ? (
        <p className="mt-2 text-xs opacity-80">Order status: {orderStatus.replaceAll('_', ' ').toLowerCase()}.</p>
      ) : null}
    </div>
  );
}

/**
 * The shop's window on this payment request, ticking.
 *
 * Passing the render-time value in as a prop keeps the first client render equal
 * to the server HTML; only after mount does the clock take over.
 */
function PayWindow({
  closesAtMs,
  initialRemainingMs,
}: {
  closesAtMs: number;
  initialRemainingMs: number;
}) {
  const [nowMs, setNowMs] = useState<number | null>(null);

  useEffect(() => {
    const tick = () => setNowMs(Date.now());
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, []);

  const remainingMs = nowMs === null ? initialRemainingMs : Math.max(0, closesAtMs - nowMs);

  if (remainingMs > 0) {
    return (
      <div className="mt-4 flex items-baseline justify-between gap-3 rounded-xl bg-zinc-50 px-4 py-2.5 ring-1 ring-zinc-200">
        <p className="text-sm text-zinc-600">
          The shop holds this request for {PAY_WINDOW_MINUTES} minutes.
        </p>
        <p className="text-sm font-semibold tabular-nums text-zinc-900">
          {formatPayWindow(remainingMs)} left
        </p>
      </div>
    );
  }

  return (
    <div
      role="status"
      className="mt-4 rounded-xl bg-amber-50 px-4 py-3 text-sm leading-relaxed text-amber-900 ring-1 ring-amber-200"
    >
      <p className="font-semibold">This payment request has passed its {PAY_WINDOW_MINUTES} minutes.</p>
      <p className="mt-1">
        The order is not cancelled, and the QR would still scan — a UPI code carries no expiry of
        its own. A transfer sent now still lands in the shop&apos;s account like any other, so send
        it only if you still want this order.
      </p>
      <p className="mt-1">
        If you do pay, tap &ldquo;I&apos;ve Completed Payment&rdquo; below and keep the reference
        your UPI app shows, so the shop can find the transfer on their statement. If you would
        rather not, cancel this order and place a fresh one.
      </p>
    </div>
  );
}

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          if (timer.current) clearTimeout(timer.current);
          timer.current = setTimeout(() => setCopied(false), 2000);
        } catch {
          // Clipboard permission denied; the text stays selectable as a fallback.
        }
      }}
      className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-xs font-semibold text-zinc-700 hover:bg-zinc-50"
    >
      {copied ? 'Copied' : 'Copy'}
    </button>
  );
}

/** Mobile shows "Open UPI App"; a laptop shows the desktop-safe wording. */
function useCoarsePointer(): boolean {
  return useSyncExternalStore(
    (onStoreChange) => {
      const query = window.matchMedia('(pointer: coarse)');
      query.addEventListener('change', onStoreChange);
      return () => query.removeEventListener('change', onStoreChange);
    },
    () => window.matchMedia('(pointer: coarse)').matches,
    () => false,
  );
}
