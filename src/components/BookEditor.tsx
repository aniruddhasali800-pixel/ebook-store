'use client';

import { useActionState } from 'react';
import { saveBookAction, type BookFormState } from '@/lib/actions/dashboard';

export type BookDraft = {
  id: string;
  slug: string;
  title: string;
  subtitle: string | null;
  author: string;
  category: string;
  blurb: string;
  /** Pre-formatted plain numbers ("399.00") so the form never parses money twice. */
  price: string;
  listPrice: string;
  pages: string;
  format: string;
  filePath: string;
  /** Server-made URL for the uploaded cover, or null when the shop has no artwork. */
  coverUrl: string | null;
  published: boolean;
};

const FIELD =
  'mt-1.5 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-zinc-900 focus:ring-2 focus:ring-zinc-900/10';
const FILE = 'mt-1.5 w-full text-sm text-zinc-600 file:mr-3 file:rounded-lg file:border-0 file:bg-zinc-900 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-white hover:file:bg-zinc-700';
const LABEL = 'block text-sm';
const CAPTION = 'font-medium text-zinc-700';

export function BookEditor({ book, isNew = false }: { book?: BookDraft; isNew?: boolean }) {
  const [state, formAction, pending] = useActionState(saveBookAction, undefined as BookFormState);

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="id" value={book?.id ?? ''} />

      <div className="grid gap-3 sm:grid-cols-2">
        <label className={LABEL}>
          <span className={CAPTION}>Title</span>
          <input name="title" required maxLength={120} defaultValue={book?.title ?? ''} className={FIELD} />
        </label>
        <label className={LABEL}>
          <span className={CAPTION}>Web address (slug)</span>
          <input
            name="slug"
            maxLength={80}
            placeholder={book?.slug ?? 'left blank, it comes from the title'}
            defaultValue={book?.slug ?? ''}
            className={FIELD + ' font-mono text-xs'}
          />
        </label>
        <label className={LABEL}>
          <span className={CAPTION}>Subtitle</span>
          <input name="subtitle" maxLength={140} defaultValue={book?.subtitle ?? ''} className={FIELD} />
        </label>
        <label className={LABEL}>
          <span className={CAPTION}>Author</span>
          <input name="author" maxLength={80} defaultValue={book?.author ?? ''} className={FIELD} />
        </label>
      </div>

      <div className="grid gap-3 sm:grid-cols-4">
        <label className={LABEL}>
          <span className={CAPTION}>Price ₹</span>
          <input
            name="price"
            required
            inputMode="decimal"
            defaultValue={book?.price ?? ''}
            placeholder="399"
            className={FIELD + ' tabular-nums'}
          />
        </label>
        <label className={LABEL}>
          <span className={CAPTION}>Was ₹ (optional)</span>
          <input
            name="listPrice"
            inputMode="decimal"
            defaultValue={book?.listPrice ?? ''}
            placeholder="699"
            className={FIELD + ' tabular-nums'}
          />
        </label>
        <label className={LABEL}>
          <span className={CAPTION}>Pages</span>
          <input
            name="pages"
            inputMode="numeric"
            defaultValue={book?.pages ?? ''}
            className={FIELD + ' tabular-nums'}
          />
        </label>
        <label className={LABEL}>
          <span className={CAPTION}>Category</span>
          <input name="category" maxLength={40} defaultValue={book?.category ?? 'AI'} className={FIELD} />
        </label>
      </div>

      <label className={LABEL}>
        <span className={CAPTION}>Blurb</span>
        <textarea
          name="blurb"
          rows={3}
          maxLength={1200}
          defaultValue={book?.blurb ?? ''}
          className={FIELD + ' leading-relaxed'}
        />
      </label>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className={LABEL}>
          <span className={CAPTION}>File path</span>
          <input
            name="filePath"
            defaultValue={book?.filePath ?? ''}
            placeholder="set by an upload, or paste the stored address"
            className={FIELD + ' font-mono text-xs'}
          />
        </label>
        <label className={LABEL}>
          <span className={CAPTION}>Format label</span>
          <input name="format" maxLength={40} defaultValue={book?.format ?? 'PDF'} className={FIELD} />
        </label>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className={LABEL}>
          <span className={CAPTION}>Cover image</span>
          <input
            name="cover"
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className={FILE}
          />
          <span className="mt-1 block text-xs leading-relaxed text-zinc-500">
            {book?.coverUrl ? (
              <>
                Current cover:{' '}
                <a href={book.coverUrl} target="_blank" rel="noreferrer" className="underline">
                  open it in a tab
                </a>
                . Picking a file here replaces it.
              </>
            ) : (
              'PNG, JPEG or WebP, up to 3 MB. With no artwork the shop shows its typeset plate.'
            )}
          </span>
        </label>
        <label className={LABEL}>
          <span className={CAPTION}>The book itself (PDF)</span>
          <input name="bookFile" type="file" accept="application/pdf" className={FILE} />
          <span className="mt-1 block text-xs leading-relaxed text-zinc-500">
            Up to 30 MB. A title cannot be published without a file — a buyer would pay and get
            nothing.
          </span>
        </label>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        {isNew ? (
          <p className="text-xs leading-relaxed text-zinc-500">
            New titles land in the review queue and stay hidden until an admin publishes them.
          </p>
        ) : (
          <label className="flex items-center gap-2 text-sm text-zinc-700">
            <input
              type="checkbox"
              name="published"
              defaultChecked={book?.published ?? true}
              className="size-4 accent-emerald-600"
            />
            Visible in the shop
          </label>
        )}
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-zinc-700 disabled:opacity-50"
        >
          {pending ? 'Saving…' : isNew ? 'Add title' : 'Save changes'}
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
  );
}
