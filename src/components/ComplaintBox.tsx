'use client';

import Link from 'next/link';
import { useActionState, useState } from 'react';
import { fileComplaintAction, type ComplaintFormState } from '@/lib/actions/complaints';
import type { ComplaintView } from '@/lib/cases';

const initialState: ComplaintFormState = undefined;

/**
 * The complaint box. Customers reach the shop from here without hunting for an
 * email address, and the shop's reply shows up on the same page they complained
 * from — which is the only version of "we heard you" a buyer can actually check.
 */
export function ComplaintBox({
  token,
  bookId,
  existing,
}: {
  token?: string;
  bookId?: string;
  existing: ComplaintView[];
}) {
  const [state, formAction, pending] = useActionState(fileComplaintAction, initialState);
  const [open, setOpen] = useState(false);

  return (
    <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-zinc-200">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Complaints and questions</h2>
        <Link href="/complaints-policy" className="text-xs text-zinc-500 underline-offset-2 hover:underline">
          How complaints are handled
        </Link>
      </div>

      {existing.length > 0 ? (
        <ul className="mt-3 space-y-2">
          {existing.map((complaint) => (
            <li key={complaint.id} className="rounded-xl bg-zinc-50 px-4 py-3 ring-1 ring-zinc-200/70">
              <p className="flex flex-wrap items-baseline justify-between gap-2 text-sm font-semibold text-zinc-900">
                {complaint.subject}
                <span className="text-[11px] font-medium uppercase tracking-wider text-zinc-500">
                  {complaint.statusLabel}
                </span>
              </p>
              <p className="mt-1 whitespace-pre-line text-[13px] leading-relaxed text-zinc-600">{complaint.body}</p>
              {complaint.reply ? (
                <p className="mt-2 rounded-lg bg-white px-3 py-2 text-[13px] leading-relaxed text-zinc-800 ring-1 ring-zinc-200">
                  <span className="font-semibold">The shop replied</span>
                  {complaint.answeredLabel ? <span className="text-zinc-500"> · {complaint.answeredLabel}</span> : null}
                  <span className="mt-1 block whitespace-pre-line">{complaint.reply}</span>
                </p>
              ) : (
                <p className="mt-1.5 text-[12px] text-zinc-500">Sent {complaint.createdAtLabel}. Waiting for the shop.</p>
              )}
            </li>
          ))}
        </ul>
      ) : null}

      {open ? (
        <form action={formAction} className="mt-4 space-y-3">
          {token ? <input type="hidden" name="token" value={token} /> : null}
          {bookId ? <input type="hidden" name="bookId" value={bookId} /> : null}
          {/* Honeypot. A human never sees it; a script that fills everything does. */}
          <input type="text" name="website" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden />

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm">
              <span className="font-medium text-zinc-800">Your name</span>
              <input
                name="fromName"
                required
                minLength={2}
                className="mt-1.5 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-900 focus:outline-none"
              />
            </label>
            <label className="block text-sm">
              <span className="font-medium text-zinc-800">
                Phone or email <span className="font-normal text-zinc-500">(optional if sent from an order)</span>
              </span>
              <input
                name="contact"
                className="mt-1.5 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-900 focus:outline-none"
              />
            </label>
          </div>

          <label className="block text-sm">
            <span className="font-medium text-zinc-800">Subject</span>
            <input
              name="subject"
              required
              minLength={4}
              placeholder="Wrong file downloaded"
              className="mt-1.5 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm placeholder:text-zinc-400 focus:border-zinc-900 focus:outline-none"
            />
          </label>

          <label className="block text-sm">
            <span className="font-medium text-zinc-800">What happened</span>
            <textarea
              name="body"
              required
              rows={4}
              minLength={20}
              placeholder="Say what you expected, what you got, and when. The order number is added for you if you are sending this from your receipt page."
              className="mt-1.5 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm placeholder:text-zinc-400 focus:border-zinc-900 focus:outline-none"
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
              {state.href ? (
                <Link
                  href={state.href}
                  className="ml-2 whitespace-nowrap font-semibold underline underline-offset-2"
                >
                  {state.linkLabel ?? 'Track it'}
                </Link>
              ) : null}
            </p>
          ) : null}

          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={pending}
              className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-zinc-700 disabled:opacity-60"
            >
              {pending ? 'Sending…' : 'Send to the shop'}
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="text-sm text-zinc-500 hover:text-zinc-800"
            >
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <div className="mt-3">
          <p className="text-[13px] leading-relaxed text-zinc-600">
            Something wrong with a book, a payment or this site? Tell the shop and they will answer here.
          </p>
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="mt-2.5 rounded-lg border border-zinc-300 px-3.5 py-2 text-sm font-medium text-zinc-800 transition hover:border-zinc-900 hover:bg-zinc-50"
          >
            Write a complaint
          </button>
        </div>
      )}
    </section>
  );
}
