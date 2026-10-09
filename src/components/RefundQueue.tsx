'use client';

import Link from 'next/link';
import { useOptimistic, useState, useTransition } from 'react';
import { decideRefundAction } from '@/lib/actions/refunds';
import { caseStatusTone, REFUND_STATUS_LABELS, type RefundStatus } from '@/lib/case-status';
import type { RefundQueueRow } from '@/lib/cases';

type Change = { id: string; status: RefundStatus; reference: string | null };

type Button = {
  value: string;
  label: string;
  to: RefundStatus;
  className: string;
  /** The extra field this decision cannot be recorded without. */
  requires?: 'payoutReference';
};

/** Which decision each row may still offer — mirrors the transition table. */
const BY_STATUS: Record<RefundStatus, Button[]> = {
  REQUESTED: [
    { value: 'approve', label: 'Approve', to: 'APPROVED', className: 'bg-emerald-600 text-white hover:bg-emerald-700' },
    { value: 'reject', label: 'Refuse', to: 'REJECTED', className: 'bg-white text-zinc-700 ring-1 ring-zinc-300 hover:bg-zinc-50' },
  ],
  APPROVED: [
    {
      value: 'refunded',
      label: 'Mark paid back',
      to: 'REFUNDED',
      className: 'bg-zinc-900 text-white hover:bg-zinc-700',
      requires: 'payoutReference',
    },
    { value: 'reject', label: 'Refuse instead', to: 'REJECTED', className: 'bg-white text-zinc-700 ring-1 ring-zinc-300 hover:bg-zinc-50' },
  ],
  REFUNDED: [],
  REJECTED: [],
};

/**
 * The refund queue.
 *
 * Nothing here pays anyone. The buttons record what the staffer did in their own
 * banking app, and "paid back" stays unreachable until a transfer reference is
 * typed in — the same rule the server enforces, applied before the click.
 */
export function RefundQueue({
  rows,
  emptyTitle = 'No refund requests waiting',
  emptyBody = 'A request appears here the moment a buyer asks from their receipt page.',
}: {
  rows: RefundQueueRow[];
  emptyTitle?: string;
  emptyBody?: string;
}) {
  const [items, applyChange] = useOptimistic(rows, (current: RefundQueueRow[], change: Change) =>
    current.map((row) =>
      row.id === change.id
        ? {
            ...row,
            status: change.status,
            decisionLabel: REFUND_STATUS_LABELS[change.status],
            payoutReference: change.reference ?? row.payoutReference,
            overdue: change.status === 'REQUESTED' || change.status === 'APPROVED' ? row.overdue : false,
          }
        : row,
    ),
  );

  if (items.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-zinc-300 bg-white/60 p-10 text-center">
        <p className="font-medium text-zinc-700">{emptyTitle}</p>
        <p className="mt-1 text-sm text-zinc-500">{emptyBody}</p>
      </div>
    );
  }

  return (
    <ul className="space-y-3">
      {items.map((row) => (
        <RefundCard key={row.id} row={row} applyChange={applyChange} />
      ))}
    </ul>
  );
}

function RefundCard({ row, applyChange }: { row: RefundQueueRow; applyChange: (change: Change) => void }) {
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [pending, startDecision] = useTransition();
  const buttons = BY_STATUS[row.status];

  async function submit(payload: FormData) {
    const button = buttons.find((entry) => entry.value === String(payload.get('decision')));
    if (!button) return;

    const reference = String(payload.get('payoutReference') ?? '').trim();
    if (button.requires === 'payoutReference' && !reference) {
      // The server would refuse this too; refusing here keeps the shop's promise
      // from ever being recorded ahead of the money.
      setResult({
        ok: false,
        message: 'Send the money from your own UPI or banking app first, then type the reference it gives you.',
      });
      return;
    }

    startDecision(async () => {
      applyChange({ id: row.id, status: button.to, reference: reference || null });
      const outcome = await decideRefundAction(undefined, payload);
      setResult(outcome ? { ok: outcome.ok, message: outcome.message ?? '' } : { ok: false, message: 'No answer came back. Try again.' });
    });
  }

  return (
    <li className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-zinc-200">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-2 font-semibold text-zinc-900">
            <Link href={`/pay/${row.orderToken}`} className="hover:underline">
              Order #{row.orderCode}
            </Link>
            <span
              className={`rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider ring-1 ${caseStatusTone(row.status)}`}
            >
              {row.decisionLabel}
            </span>
            {row.overdue ? (
              <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-rose-700">
                Past due
              </span>
            ) : null}
          </p>
          <p className="mt-1 text-sm text-zinc-600">
            {row.customerLabel} · asked {row.requestedLabel}
          </p>
        </div>
        <p className="text-xl font-semibold tabular-nums text-zinc-900">{row.amountLabel}</p>
      </div>

      <blockquote className="mt-3 rounded-xl bg-zinc-50 px-4 py-3 text-[13px] leading-relaxed text-zinc-700 ring-1 ring-zinc-200/70">
        {row.reason}
      </blockquote>

      <dl className="mt-3 grid gap-x-6 gap-y-1 text-xs text-zinc-500 sm:grid-cols-2">
        <div className="flex gap-1.5">
          <dt>Answer due</dt>
          <dd className={`font-medium ${row.overdue ? 'text-rose-700' : 'text-zinc-700'}`}>{row.dueLabel}</dd>
        </div>
        {row.payoutVpa ? (
          <div className="flex gap-1.5">
            <dt>Buyer’s UPI ID</dt>
            <dd className="font-mono text-zinc-700">{row.payoutVpa}</dd>
          </div>
        ) : (
          <div className="flex gap-1.5">
            <dt>Payout</dt>
            <dd className="text-zinc-700">Back to the account they paid from</dd>
          </div>
        )}
        {row.reviewedByName ? (
          <div className="flex gap-1.5">
            <dt>Decided by</dt>
            <dd className="text-zinc-700">{row.reviewedByName}</dd>
          </div>
        ) : null}
        {row.payoutReference ? (
          <div className="flex gap-1.5">
            <dt>Transfer reference</dt>
            <dd className="font-mono text-emerald-700">{row.payoutReference}</dd>
          </div>
        ) : null}
      </dl>

      {row.decisionNote ? (
        <p className="mt-3 border-l-2 border-zinc-300 pl-3 text-[13px] leading-relaxed text-zinc-700">
          Your note: {row.decisionNote}
        </p>
      ) : null}

      {buttons.length > 0 ? (
        <form action={submit} className="mt-4 space-y-3 border-t border-dashed border-zinc-200 pt-4">
          <input type="hidden" name="refundId" value={row.id} />
          <input type="hidden" name="channel" value={row.channel} />

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm">
              <span className="font-medium text-zinc-700">Reason the buyer sees</span>
              <input
                name="note"
                maxLength={300}
                placeholder="Why you approved or refused it, in one line."
                className="mt-1.5 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-zinc-900 focus:ring-2 focus:ring-zinc-900/10"
              />
            </label>
            <label className="block text-sm">
              <span className="font-medium text-zinc-700">Transfer reference (UTR)</span>
              <input
                name="payoutReference"
                maxLength={60}
                placeholder="Only when you have actually sent the money"
                defaultValue={row.payoutReference ?? ''}
                className="mt-1.5 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm tabular-nums outline-none focus:border-zinc-900 focus:ring-2 focus:ring-zinc-900/10"
              />
            </label>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {buttons.map((button) => (
              <button
                key={button.value}
                type="submit"
                name="decision"
                value={button.value}
                disabled={pending}
                className={`rounded-lg px-3.5 py-2 text-sm font-semibold transition disabled:opacity-50 ${button.className}`}
              >
                {button.label}
              </button>
            ))}
            <p className="text-xs text-zinc-500">
              {row.status === 'APPROVED'
                ? 'Pay them first. This site cannot move money, so “paid back” is a record of a transfer you already made.'
                : 'The buyer sees your note on their receipt page.'}
            </p>
          </div>

          {result ? (
            <p
              role="status"
              className={`rounded-lg px-3 py-2 text-sm ring-1 ${
                result.ok
                  ? 'bg-emerald-50 text-emerald-800 ring-emerald-200'
                  : 'bg-rose-50 text-rose-700 ring-rose-200'
              }`}
            >
              {result.message}
            </p>
          ) : null}
        </form>
      ) : (
        <p className="mt-4 border-t border-dashed border-zinc-200 pt-3 text-xs text-zinc-500">
          {row.status === 'REFUNDED'
            ? `Closed — ${row.payoutReference ? `payout reference ${row.payoutReference}` : 'payout recorded'}.`
            : 'Refused. A buyer can still send a complaint about this.'}
        </p>
      )}
    </li>
  );
}
