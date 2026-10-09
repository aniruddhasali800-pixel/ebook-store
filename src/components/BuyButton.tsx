'use client';

import { useState } from 'react';
import { useActionState } from 'react';
import { PaymentMethodPicker } from '@/components/PaymentMethodPicker';
import { buyBookAction, type BuyState } from '@/lib/actions/books';
import type { PaymentProviderAdapter } from '@/lib/payments/types';

/**
 * One click to an invoice. The button starts a PENDING order and moves to the
 * payment page — it never implies the purchase is complete.
 */
export function BuyButton({
  bookId,
  label,
  tone = 'solid',
  providers = [],
}: {
  bookId: string;
  label: string;
  tone?: 'solid' | 'ghost';
  providers?: Pick<PaymentProviderAdapter, 'id' | 'label'>[];
}) {
  const [state, formAction, pending] = useActionState<BuyState, FormData>(buyBookAction, null);
  const [method, setMethod] = useState(providers[0]?.id ?? 'UPI_DIRECT');
  const offersChoice = providers.length > 1;

  return (
    <form action={formAction} className="space-y-2.5">
      <input type="hidden" name="bookId" value={bookId} />
      <PaymentMethodPicker
        providers={providers}
        tone={tone === 'solid' ? 'dark' : 'light'}
        value={offersChoice ? method : undefined}
        onChange={offersChoice ? setMethod : undefined}
      />
      <button
        type="submit"
        disabled={pending}
        className={
          tone === 'solid'
            ? 'w-full rounded-xl bg-gradient-to-b from-amber-300 to-amber-500 px-4 py-2.5 text-sm font-semibold text-[#231603] shadow-lg shadow-amber-500/20 transition hover:from-amber-200 hover:to-amber-400 disabled:opacity-60'
            : 'w-full rounded-xl border border-white/15 px-4 py-2.5 text-sm font-semibold text-zinc-100 transition hover:border-white/30 hover:bg-white/5 disabled:opacity-60'
        }
      >
        {pending ? 'Preparing your invoice…' : offersChoice ? `Buy now · ${byLabel(method)}` : label}
      </button>
      {state && !state.ok ? (
        <p role="alert" className="text-xs leading-relaxed text-rose-300">
          {state.message}
        </p>
      ) : null}
    </form>
  );
}

function byLabel(providerId: string): string {
  return providerId === 'CARD_HOSTED' ? 'card' : 'UPI';
}
