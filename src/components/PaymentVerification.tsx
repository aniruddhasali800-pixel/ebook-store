'use client';

import { useActionState } from 'react';
import { PaymentStatus } from '@/components/PaymentStatus';
import { verifyPaymentAction, type StaffFormState } from '@/lib/actions/staff';
import type { PaymentStatus as PaymentStatusValue } from '@/lib/payments/status';

export type VerificationRow = {
  id: string;
  orderCode: string;
  customerLabel: string;
  itemSummary: string;
  amountLabel: string;
  /** Pre-formatted server-side so this component never guesses a timezone. */
  submittedAt: string;
  paymentStatus: PaymentStatusValue;
  paymentReference: string | null;
  verifiedByName: string | null;
  upiIdUsed: string | null;
  /** Adapter id from the order row; decides whose confirmation staff should trust. */
  paymentMethod: string;
};

const initialState: StaffFormState = undefined;

export function PaymentVerification({
  rows,
  action = verifyPaymentAction,
  emptyTitle = 'Nothing waiting for verification',
  emptyBody = 'Orders appear here after a customer says they have paid.',
}: {
  rows: VerificationRow[];
  /** The staff queue and the book dashboard settle orders through different actions. */
  action?: (state: StaffFormState, payload: FormData) => Promise<StaffFormState>;
  emptyTitle?: string;
  emptyBody?: string;
}) {
  if (rows.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-zinc-300 bg-white/60 p-10 text-center">
        <p className="font-medium text-zinc-700">{emptyTitle}</p>
        <p className="mt-1 text-sm text-zinc-500">{emptyBody}</p>
      </div>
    );
  }

  return (
    <ul className="space-y-3">
      {rows.map((row) => (
        <VerificationCard key={row.id} row={row} action={action} />
      ))}
    </ul>
  );
}

function VerificationCard({
  row,
  action,
}: {
  row: VerificationRow;
  action: (state: StaffFormState, payload: FormData) => Promise<StaffFormState>;
}) {
  const [state, formAction, pending] = useActionState(action, initialState);

  return (
    <li className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-zinc-200">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-2 font-semibold text-zinc-900">
            Order #{row.orderCode}
            <PaymentStatus status={row.paymentStatus} />
          </p>
          <p className="mt-1 text-sm text-zinc-600">
            {row.customerLabel} · submitted {row.submittedAt}
          </p>
          <p className="mt-2 text-sm leading-relaxed text-zinc-700">{row.itemSummary}</p>
          {row.upiIdUsed ? (
            <p className="mt-1 text-xs text-zinc-500">
              Payee on the QR: <span className="font-medium">{row.upiIdUsed}</span>
            </p>
          ) : null}
          <p className="mt-1 text-xs text-zinc-500">
            Method: <span className="font-medium">{methodLabel(row.paymentMethod)}</span>
            {row.paymentMethod === 'CARD_HOSTED'
              ? ' — the gateway reports these itself, so check its dashboard before overriding it.'
              : ''}
          </p>
        </div>
        <p className="text-xl font-semibold tabular-nums text-zinc-900">{row.amountLabel}</p>
      </div>

      <form action={formAction} className="mt-4 space-y-3 border-t border-dashed border-zinc-200 pt-4">
        <input type="hidden" name="orderId" value={row.id} />

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-sm">
            <span className="font-medium text-zinc-700">Bank reference (UTR)</span>
            <input
              name="reference"
              maxLength={35}
              placeholder="12-digit UTR from the statement"
              defaultValue={row.paymentReference ?? ''}
              className="mt-1.5 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm tabular-nums outline-none focus:border-zinc-900 focus:ring-2 focus:ring-zinc-900/10"
            />
          </label>
          <label className="block text-sm">
            <span className="font-medium text-zinc-700">Note (optional)</span>
            <input
              name="reason"
              maxLength={200}
              placeholder="Amount mismatched by ₹1, short-paid…"
              className="mt-1.5 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-zinc-900 focus:ring-2 focus:ring-zinc-900/10"
            />
          </label>
        </div>

        <p className="text-xs leading-relaxed text-zinc-500">
          Only mark as paid after the transfer is visible in the merchant&apos;s bank or UPI app
          statement with a matching amount{row.paymentReference ? ` (last recorded reference: ${row.paymentReference})` : ''}.
        </p>

        <div className="flex flex-wrap gap-2">
          <button
            type="submit"
            name="decision"
            value="paid"
            disabled={pending}
            className="rounded-lg bg-emerald-600 px-3.5 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            Mark Paid
          </button>
          <button
            type="submit"
            name="decision"
            value="failed"
            disabled={pending}
            className="rounded-lg bg-rose-600 px-3.5 py-2 text-sm font-semibold text-white hover:bg-rose-700 disabled:opacity-50"
          >
            Mark Failed
          </button>
          <button
            type="submit"
            name="decision"
            value="cancelled"
            disabled={pending}
            className="rounded-lg border border-zinc-300 bg-white px-3.5 py-2 text-sm font-semibold text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
          >
            Cancel order
          </button>
        </div>

        {state?.message ? (
          <p
            role="status"
            className={`rounded-lg px-3 py-2 text-sm ring-1 ${
              state.ok
                ? 'bg-emerald-50 text-emerald-800 ring-emerald-200'
                : 'bg-rose-50 text-rose-700 ring-rose-200'
            }`}
          >
            {state.message}
          </p>
        ) : null}
      </form>
    </li>
  );
}

/** Staff-facing name for the adapter id stored on the order row. */
function methodLabel(paymentMethod: string): string {
  if (paymentMethod === 'CARD_HOSTED') return 'Card (gateway webhook)';
  if (paymentMethod === 'UPI_DIRECT') return 'UPI direct';
  return paymentMethod;
}
