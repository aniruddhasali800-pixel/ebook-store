'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createOrderAction, type CartLine } from '@/lib/actions/customer';
import { PaymentMethodPicker } from '@/components/PaymentMethodPicker';
import { formatINR } from '@/lib/money';
import { PAY_WINDOW_MINUTES } from '@/lib/pay/window';
import type { PaymentProviderAdapter } from '@/lib/payments/types';

type MenuRow = {
  id: string;
  name: string;
  description: string | null;
  category: string;
  priceInPaise: number;
};

type PaymentOption = Pick<PaymentProviderAdapter, 'id' | 'label'>;

export function Cart({
  menu,
  paymentsEnabled,
  providers,
}: {
  menu: MenuRow[];
  paymentsEnabled: boolean;
  providers: PaymentOption[];
}) {
  const router = useRouter();
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [customerLabel, setCustomerLabel] = useState('');
  const [paymentMethod, setPaymentMethod] = useState(providers[0]?.id ?? 'UPI_DIRECT');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const lines = useMemo<CartLine[]>(
    () =>
      Object.entries(quantities)
        .filter(([, quantity]) => quantity > 0)
        .map(([menuItemId, quantity]) => ({ menuItemId, quantity })),
    [quantities],
  );

  const totalInPaise = useMemo(
    () =>
      lines.reduce((total, line) => {
        const item = menu.find((row) => row.id === line.menuItemId);
        return total + (item ? item.priceInPaise * line.quantity : 0);
      }, 0),
    [lines, menu],
  );

  const grouped = useMemo(() => {
    const byCategory = new Map<string, MenuRow[]>();
    for (const item of menu) {
      const list = byCategory.get(item.category) ?? [];
      list.push(item);
      byCategory.set(item.category, list);
    }
    return [...byCategory.entries()];
  }, [menu]);

  function setQuantity(id: string, quantity: number) {
    setQuantities((current) => {
      const next = { ...current };
      if (quantity <= 0) delete next[id];
      else next[id] = Math.min(quantity, 99);
      return next;
    });
  }

  async function submit() {
    setSubmitting(true);
    setError(null);
    const result = await createOrderAction({ cart: lines, customerLabel, paymentMethod });
    if (result.ok) {
      router.push(`/pay/${result.token}`);
      return;
    }
    setError(result.message ?? 'Could not start the payment.');
    setSubmitting(false);
  }

  const itemCount = lines.reduce((sum, line) => sum + line.quantity, 0);
  const byCard = paymentMethod === 'CARD_HOSTED';

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
      <section className="space-y-6">
        {!paymentsEnabled ? (
          <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900 ring-1 ring-amber-200">
            UPI payments are not enabled yet. An admin must save a UPI ID in Payment
            Settings before orders can be created.
          </p>
        ) : null}

        {grouped.map(([category, items]) => (
          <div key={category}>
            <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
              {category}
            </h2>
            <ul className="mt-3 grid gap-3 sm:grid-cols-2">
              {items.map((item) => {
                const quantity = quantities[item.id] ?? 0;
                return (
                  <li
                    key={item.id}
                    className="flex items-start justify-between gap-3 rounded-xl bg-white p-4 ring-1 ring-zinc-200"
                  >
                    <div className="min-w-0">
                      <p className="font-medium text-zinc-900">{item.name}</p>
                      {item.description ? (
                        <p className="mt-0.5 text-sm leading-snug text-zinc-500">
                          {item.description}
                        </p>
                      ) : null}
                      <p className="mt-2 text-sm font-semibold tabular-nums text-zinc-900">
                        {formatINR(item.priceInPaise)}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5">
                      <StepButton
                        label={`Remove one ${item.name}`}
                        onClick={() => setQuantity(item.id, quantity - 1)}
                        disabled={quantity === 0}
                      >
                        −
                      </StepButton>
                      <span className="w-6 text-center text-sm font-semibold tabular-nums text-zinc-900">
                        {quantity}
                      </span>
                      <StepButton
                        label={`Add one ${item.name}`}
                        onClick={() => setQuantity(item.id, quantity + 1)}
                      >
                        +
                      </StepButton>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </section>

      <aside className="lg:sticky lg:top-6 lg:self-start">
        <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-zinc-200">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-500">
            Current order
          </h2>

          {lines.length === 0 ? (
            <p className="mt-3 text-sm text-zinc-500">Nothing selected yet.</p>
          ) : (
            <ul className="mt-3 space-y-2 text-sm">
              {lines.map((line) => {
                const item = menu.find((row) => row.id === line.menuItemId);
                if (!item) return null;
                return (
                  <li key={item.id} className="flex justify-between gap-3">
                    <span className="min-w-0 truncate text-zinc-700">
                      {item.name}
                      <span className="text-zinc-400"> × {line.quantity}</span>
                    </span>
                    <span className="tabular-nums text-zinc-900">
                      {formatINR(item.priceInPaise * line.quantity)}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}

          <div className="mt-4 flex justify-between border-t border-dashed border-zinc-200 pt-4">
            <span className="text-sm font-medium text-zinc-700">Total</span>
            <span className="text-lg font-semibold tabular-nums text-zinc-900">
              {formatINR(totalInPaise)}
            </span>
          </div>

          <div className="mt-4">
            <PaymentMethodPicker
              providers={providers}
              value={paymentMethod}
              onChange={setPaymentMethod}
            />
          </div>

          <label className="mt-4 block text-sm">
            <span className="font-medium text-zinc-700">Name or table (optional)</span>
            <input
              value={customerLabel}
              onChange={(event) => setCustomerLabel(event.target.value)}
              maxLength={60}
              placeholder="e.g. Ananya / Table 4"
              className="mt-1.5 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900 outline-none focus:border-zinc-900 focus:ring-2 focus:ring-zinc-900/10"
            />
          </label>

          <button
            type="button"
            onClick={submit}
            disabled={lines.length === 0 || submitting || !paymentsEnabled}
            className="mt-4 w-full rounded-xl bg-zinc-900 px-4 py-3 text-sm font-semibold text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:bg-zinc-200 disabled:text-zinc-400"
          >
            {submitting
              ? 'Creating order…'
              : `${payByLabel(paymentMethod)}${itemCount > 0 ? ` (${itemCount})` : ''}`}
          </button>

          {error ? (
            <p role="alert" className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700 ring-1 ring-rose-200">
              {error}
            </p>
          ) : null}

          <p className="mt-3 text-xs leading-relaxed text-zinc-500">
            {byCard
              ? 'The next screen opens the gateway checkout for this exact amount. In test mode it is a simulated gateway: nothing is charged, and it tells you so.'
              : 'A fresh QR code is generated for this order with the amount locked in. After paying you confirm on the next screen; the business verifies the transfer before the order reaches the kitchen.'}
            {' '}The shop holds the request for {PAY_WINDOW_MINUTES} minutes. Past that the page says so and
            stops counting — nothing is cancelled on you, and a transfer you did send is still checked
            against the statement.
          </p>
        </div>
      </aside>
    </div>
  );
}

/** The button never claims money arrived; it only says how the order will be paid for. */
function payByLabel(paymentMethod: string): string {
  if (paymentMethod === 'CARD_HOSTED') return 'Pay by card';
  if (paymentMethod === 'UPI_DIRECT') return 'Pay by UPI';
  return 'Place order';
}

function StepButton({
  children,
  label,
  onClick,
  disabled,
}: {
  children: React.ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      className="size-7 rounded-lg border border-zinc-300 bg-white text-sm font-semibold text-zinc-700 transition hover:bg-zinc-50 disabled:opacity-40"
    >
      {children}
    </button>
  );
}
