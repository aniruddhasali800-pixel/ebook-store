'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { requestRefundAction } from '@/lib/actions/refunds';
import type { StaffFormState } from '@/lib/actions/staff';
import type { RefundPanelProps } from '@/lib/cases';

export type { RefundPanelProps };

const initialState: StaffFormState = undefined;

/**
 * The buyer's side of a refund.
 *
 * It shows the deadline the shop owes them and the answer the shop gave, and it
 * never suggests money has moved. "Paid back" only appears when a person at the
 * shop wrote the transfer reference that proves it.
 */
export function RefundRequest({
  token,
  amountLabel,
  blockedReason,
  requestUntilLabel,
  history,
}: RefundPanelProps) {
  const [state, formAction, pending] = useActionState(requestRefundAction, initialState);
  // The form offers itself only while a request is possible; once one is on file the
  // panel shows its status instead, which is the same fact the shop is looking at.
  const open = history.length === 0 && !blockedReason;

  return (
    <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-zinc-200">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Refunds</h2>
        <Link href="/refund-policy" className="text-xs text-zinc-500 underline-offset-2 hover:underline">
          Read the refund policy
        </Link>
      </div>

      {history.length > 0 ? (
        <ul className="mt-3 space-y-2">
          {history.map((entry) => (
            <li key={entry.requestedLabel + entry.status} className="rounded-xl bg-zinc-50 px-4 py-3 ring-1 ring-zinc-200/70">
              <p className="flex flex-wrap items-baseline justify-between gap-2 text-sm font-semibold text-zinc-900">
                {entry.decisionLabel}
                <span className="font-mono text-[11px] font-normal text-zinc-500">{entry.requestedLabel}</span>
              </p>
              <p className="mt-1 text-[13px] leading-relaxed text-zinc-600">{entry.copy}</p>
              {entry.dueLabel && entry.status === 'REQUESTED' ? (
                <p className="mt-1.5 text-[12px] text-zinc-500">The shop has until {entry.dueLabel} to answer.</p>
              ) : null}
              {entry.note ? (
                <p className="mt-2 border-l-2 border-zinc-300 pl-3 text-[13px] leading-relaxed text-zinc-700">
                  The shop said: {entry.note}
                </p>
              ) : null}
              {entry.reference ? (
                <p className="mt-2 font-mono text-[11px] text-zinc-500">payout reference: {entry.reference}</p>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}

      {blockedReason ? (
        <p className="mt-3 rounded-xl bg-zinc-50 px-4 py-3 text-[13px] leading-relaxed text-zinc-600 ring-1 ring-zinc-200/70">
          {blockedReason}
          {requestUntilLabel ? <span className="block text-zinc-500">The window closed on {requestUntilLabel}.</span> : null}
        </p>
      ) : null}

      {open && !blockedReason ? (
        <form action={formAction} className="mt-4 space-y-3">
          <input type="hidden" name="token" value={token} />
          <p className="text-[13px] leading-relaxed text-zinc-600">
            Ask for <strong className="font-semibold text-zinc-900">{amountLabel}</strong> back. You have until{' '}
            {requestUntilLabel ?? '24 hours after your payment was confirmed'}; the shop then has two working days to
            decide, and pays you back from its own account.
          </p>

          <label className="block text-sm">
            <span className="font-medium text-zinc-800">What went wrong?</span>
            <textarea
              name="reason"
              required
              rows={3}
              minLength={12}
              placeholder="The book was not what the page described, and I have not read past chapter two."
              className="mt-1.5 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-900 focus:outline-none"
            />
          </label>

          <label className="block text-sm">
            <span className="font-medium text-zinc-800">
              UPI ID to send it to <span className="font-normal text-zinc-500">(optional)</span>
            </span>
            <input
              name="payoutVpa"
              type="text"
              placeholder="Leave blank to be paid back to the account you paid from"
              className="mt-1.5 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-900 focus:outline-none"
            />
          </label>

          {state && !state.ok ? (
            <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700 ring-1 ring-rose-200">
              {state.message}
            </p>
          ) : null}
          {state?.ok ? (
            <p role="status" className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800 ring-1 ring-emerald-200">
              {state.message}
            </p>
          ) : null}

          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={pending}
              className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-zinc-700 disabled:opacity-60"
            >
              {pending ? 'Sending…' : 'Request a refund'}
            </button>
            <span className="text-xs text-zinc-500">
              Sending this does not move any money. It asks, and the shop answers on this page.
            </span>
          </div>
        </form>
      ) : null}
    </section>
  );
}
