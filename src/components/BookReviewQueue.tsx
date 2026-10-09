'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useOptimistic, useState, useTransition } from 'react';
import { reviewBookAction } from '@/lib/actions/dashboard';
import type { BookReviewRow } from '@/lib/cases';

type Change = { id: string; decided: 'published' | 'sent back' };

const FILE_COPY: Record<BookReviewRow['fileStatus'], { label: string; tone: string }> = {
  none: { label: 'No file attached', tone: 'bg-rose-50 text-rose-700 ring-rose-200' },
  missing: { label: 'File is missing from storage', tone: 'bg-rose-50 text-rose-700 ring-rose-200' },
  outside: { label: 'Path sits outside storage/', tone: 'bg-rose-50 text-rose-700 ring-rose-200' },
  ok: { label: 'File is ready', tone: 'bg-emerald-50 text-emerald-700 ring-emerald-200' },
};

/**
 * The book review queue. Publishing is the moment a title becomes somebody's
 * purchase, so the checks a buyer cannot make — is the file there, is the price
 * right, is this the cover we want to show — are made here first.
 */
export function BookReviewQueue({
  rows,
  isAdmin,
  emptyTitle = 'Nothing to review',
  emptyBody = 'A new title submitted from the catalogue appears here before it goes on sale.',
}: {
  rows: BookReviewRow[];
  isAdmin: boolean;
  emptyTitle?: string;
  emptyBody?: string;
}) {
  const [items, applyChange] = useOptimistic(rows, (current: BookReviewRow[], change: Change) =>
    current.map((row) => (row.id === change.id ? { ...row, reviewNote: change.decided } : row)),
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
        <ReviewCard key={row.id} row={row} isAdmin={isAdmin} applyChange={applyChange} />
      ))}
    </ul>
  );
}

function ReviewCard({
  row,
  isAdmin,
  applyChange,
}: {
  row: BookReviewRow;
  isAdmin: boolean;
  applyChange: (change: Change) => void;
}) {
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [pending, startDecision] = useTransition();
  const file = FILE_COPY[row.fileStatus];
  const decided = row.reviewNote === 'published' || row.reviewNote === 'sent back' ? row.reviewNote : null;

  async function submit(payload: FormData) {
    startDecision(async () => {
      applyChange({
        id: row.id,
        decided: payload.get('decision') === 'publish' ? 'published' : 'sent back',
      });
      const outcome = await reviewBookAction(undefined, payload);
      setResult(outcome ? { ok: outcome.ok, message: outcome.message ?? '' } : { ok: false, message: 'No answer came back.' });
    });
  }

  return (
    <li className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-zinc-200">
      <div className="flex gap-4">
        <div className="w-20 shrink-0">
          {row.coverUrl ? (
            <div className="relative aspect-3/4 w-full overflow-hidden rounded ring-1 ring-zinc-200">
              <Image src={row.coverUrl} alt="" fill sizes="80px" className="object-cover" />
            </div>
          ) : (
            <div className="grid aspect-3/4 w-full place-items-center rounded bg-zinc-100 text-center text-[10px] leading-tight text-zinc-500 ring-1 ring-zinc-200">
              no artwork
            </div>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-baseline gap-2">
            <span className="font-semibold text-zinc-900">{row.title}</span>
            <span className="text-sm text-zinc-500">{row.author}</span>
            <span className="text-sm font-semibold tabular-nums text-zinc-900">{row.priceLabel}</span>
          </p>
          <p className="mt-0.5 font-mono text-xs text-zinc-500">/books/{row.slug}</p>
          <p className="mt-2 text-[13px] leading-relaxed text-zinc-700">{row.blurb || 'No blurb.'}</p>
          <p className="mt-2 flex flex-wrap gap-2 text-[11px]">
            <span className={`rounded-full px-2 py-0.5 font-semibold uppercase tracking-wider ring-1 ${file.tone}`}>
              {file.label}
            </span>
            <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-zinc-600">
              {row.format}
              {row.pages ? ` · ${row.pages} pages` : ''}
            </span>
            <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-zinc-600">submitted {row.submittedLabel}</span>
            {row.filePath ? (
              <span className="max-w-full truncate rounded-full bg-zinc-100 px-2 py-0.5 font-mono text-zinc-600">
                {row.filePath}
              </span>
            ) : null}
          </p>
        </div>
      </div>

      {!isAdmin ? (
        <p className="mt-4 border-t border-dashed border-zinc-200 pt-3 text-xs text-zinc-500">
          You can read this queue. Only an admin can publish or send a title back.
        </p>
      ) : decided ? (
        <p className="mt-4 border-t border-dashed border-zinc-200 pt-3 text-xs text-zinc-500">
          Recorded as {decided}. This card leaves the queue when the page reloads.
        </p>
      ) : (
        <form action={submit} className="mt-4 space-y-3 border-t border-dashed border-zinc-200 pt-4">
          <input type="hidden" name="bookId" value={row.id} />
          <label className="block text-sm">
            <span className="font-medium text-zinc-700">Note (optional)</span>
            <input
              name="reviewNote"
              maxLength={300}
              placeholder="What you checked, or what to fix before this goes on sale."
              className="mt-1.5 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-zinc-900 focus:ring-2 focus:ring-zinc-900/10"
            />
          </label>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="submit"
              name="decision"
              value="publish"
              disabled={pending || row.fileStatus !== 'ok'}
              className="rounded-lg bg-emerald-600 px-3.5 py-2 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Publish
            </button>
            <button
              type="submit"
              name="decision"
              value="reject"
              disabled={pending}
              className="rounded-lg bg-white px-3.5 py-2 text-sm font-semibold text-zinc-700 ring-1 ring-zinc-300 transition hover:bg-zinc-50 disabled:opacity-50"
            >
              Send back
            </button>
            <p className="text-xs text-zinc-500">
              {row.fileStatus === 'ok' ? (
                <>
                  Preview:{' '}
                  <Link href={`/books/${row.slug}`} className="underline">
                    the storefront page
                  </Link>{' '}
                  — it only shows once published.
                </>
              ) : (
                'Publishing is disabled until a readable file is attached in the catalogue.'
              )}
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
      )}
    </li>
  );
}
