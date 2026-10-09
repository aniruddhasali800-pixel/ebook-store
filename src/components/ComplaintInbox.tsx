'use client';

import Link from 'next/link';
import { useOptimistic, useState, useTransition } from 'react';
import { decideComplaintAction } from '@/lib/actions/complaints';
import { caseStatusTone, COMPLAINT_STATUS_LABELS, type ComplaintStatus } from '@/lib/case-status';
import type { ComplaintInboxRow } from '@/lib/cases';

type Change = { id: string; status: ComplaintStatus; reply: string | null };

/**
 * The complaint inbox. Both storefronts render this same list, filtered to their
 * own channel, and a reply written here is what the buyer reads on their receipt
 * page or their complaint link — there is no other copy of it anywhere.
 */
export function ComplaintInbox({
  rows,
  emptyTitle = 'Nothing in the inbox',
  emptyBody = 'Complaints arrive here from the receipt page, the book pages and the cafe menu.',
}: {
  rows: ComplaintInboxRow[];
  emptyTitle?: string;
  emptyBody?: string;
}) {
  const [items, applyChange] = useOptimistic(rows, (current: ComplaintInboxRow[], change: Change) =>
    current.map((row) =>
      row.id === change.id
        ? {
            ...row,
            status: change.status,
            statusLabel: COMPLAINT_STATUS_LABELS[change.status],
            reply: change.reply ?? row.reply,
            overdue: false,
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
        <ComplaintCard key={row.id} row={row} applyChange={applyChange} />
      ))}
    </ul>
  );
}

function ComplaintCard({ row, applyChange }: { row: ComplaintInboxRow; applyChange: (change: Change) => void }) {
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [pending, startDecision] = useTransition();

  async function submit(payload: FormData) {
    const decision = String(payload.get('decision'));
    const to: ComplaintStatus | null = decision === 'answer' ? 'ANSWERED' : decision === 'close' ? 'CLOSED' : null;
    if (!to) return;

    const reply = String(payload.get('reply') ?? '').trim();
    if (to === 'ANSWERED' && reply.length < 10) {
      setResult({ ok: false, message: 'Write what you want the buyer to read before marking it answered.' });
      return;
    }

    startDecision(async () => {
      applyChange({ id: row.id, status: to, reply: reply || null });
      const outcome = await decideComplaintAction(undefined, payload);
      setResult(outcome ? { ok: outcome.ok, message: outcome.message ?? '' } : { ok: false, message: 'No answer came back. Try again.' });
    });
  }

  return (
    <li className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-zinc-200">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-2 font-semibold text-zinc-900">
            {row.subject}
            <span
              className={`rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider ring-1 ${caseStatusTone(row.status)}`}
            >
              {row.statusLabel}
            </span>
            {row.overdue ? (
              <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-rose-700">
                Past 2 working days
              </span>
            ) : null}
          </p>
          <p className="mt-1 text-sm text-zinc-600">
            {row.fromName}
            {row.contact ? ` · ${row.contact}` : ''} · {row.createdAtLabel}
          </p>
          <p className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-zinc-500">
            <span>From: {row.source}</span>
            {row.orderCode && row.orderToken ? (
              <Link href={`/pay/${row.orderToken}`} className="underline-offset-2 hover:underline">
                order #{row.orderCode}
              </Link>
            ) : null}
            {row.bookTitle ? <span>about {row.bookTitle}</span> : null}
            {row.viewToken ? (
              <Link href={`/complaint/${row.viewToken}`} className="underline-offset-2 hover:underline">
                status link
              </Link>
            ) : null}
          </p>
        </div>
      </div>

      <p className="mt-3 whitespace-pre-line rounded-xl bg-zinc-50 px-4 py-3 text-[13px] leading-relaxed text-zinc-700 ring-1 ring-zinc-200/70">
        {row.body}
      </p>

      {row.reply ? (
        <p className="mt-3 rounded-xl bg-emerald-50/60 px-4 py-3 text-[13px] leading-relaxed text-zinc-800 ring-1 ring-emerald-200/70">
          <span className="font-semibold">Sent back</span>
          {row.answeredByName ? <span className="text-zinc-500"> · {row.answeredByName}</span> : null}
          {row.answeredLabel ? <span className="text-zinc-500"> · {row.answeredLabel}</span> : null}
          <span className="mt-1 block whitespace-pre-line">{row.reply}</span>
        </p>
      ) : null}

      <form action={submit} className="mt-4 space-y-3 border-t border-dashed border-zinc-200 pt-4">
        <input type="hidden" name="complaintId" value={row.id} />
        <label className="block text-sm">
          <span className="font-medium text-zinc-700">
            {row.reply ? 'Write a further answer' : 'Your answer to the buyer'}
          </span>
          <textarea
            name="reply"
            rows={3}
            maxLength={2000}
            defaultValue={row.reply ?? ''}
            placeholder="What you found, what you will do, and when. This exact text is what they read."
            className="mt-1.5 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-zinc-900 focus:ring-2 focus:ring-zinc-900/10"
          />
        </label>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="submit"
            name="decision"
            value="answer"
            disabled={pending}
            className="rounded-lg bg-zinc-900 px-3.5 py-2 text-sm font-semibold text-white transition hover:bg-zinc-700 disabled:opacity-50"
          >
            Send answer
          </button>
          <button
            type="submit"
            name="decision"
            value="close"
            disabled={pending}
            className="rounded-lg bg-white px-3.5 py-2 text-sm font-semibold text-zinc-700 ring-1 ring-zinc-300 transition hover:bg-zinc-50 disabled:opacity-50"
          >
            {row.status === 'ANSWERED' ? 'Close it' : 'Close without answering'}
          </button>
          <p className="text-xs text-zinc-500">
            Closing without an answer is allowed and visible — the buyer’s page says so.
          </p>
        </div>

        {result ? (
          <p
            role="status"
            className={`rounded-lg px-3 py-2 text-sm ring-1 ${
              result.ok ? 'bg-emerald-50 text-emerald-800 ring-emerald-200' : 'bg-rose-50 text-rose-700 ring-rose-200'
            }`}
          >
            {result.message}
          </p>
        ) : null}
      </form>
    </li>
  );
}
