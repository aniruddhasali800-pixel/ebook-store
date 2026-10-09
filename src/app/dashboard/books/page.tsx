import { BookEditor, type BookDraft } from '@/components/BookEditor';
import { staffOrSignIn } from '@/lib/auth/guard';
import { coverUrlFor, fileStatusFor, listAllBooks } from '@/lib/books';
import { paiseToRupeesString, formatINR } from '@/lib/money';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Catalogue' };

const FILE_WARNING: Record<ReturnType<typeof fileStatusFor>, string | null> = {
  none: 'No file attached — a buyer who pays gets nothing.',
  missing: 'The file path is set but the file is not there.',
  outside: 'The path sits outside storage/ and will never be served.',
  ok: null,
};

export default async function DashboardCataloguePage() {
  await staffOrSignIn('/dashboard/books');
  const books = await listAllBooks();

  const drafts: BookDraft[] = books.map((book) => ({
    id: book.id,
    slug: book.slug,
    title: book.title,
    subtitle: book.subtitle,
    author: book.author,
    category: book.category,
    blurb: book.blurb,
    price: paiseToRupeesString(book.priceInPaise),
    listPrice: book.listPriceInPaise ? paiseToRupeesString(book.listPriceInPaise) : '',
    pages: book.pages ? String(book.pages) : '',
    format: book.format,
    filePath: book.filePath ?? '',
    coverUrl: coverUrlFor(book.coverPath),
    published: book.published,
  }));

  return (
    <div className="space-y-5">
      <header className="space-y-1">
        <h1 className="text-xl font-semibold tracking-tight text-zinc-900">Catalogue</h1>
        <p className="text-sm leading-relaxed text-zinc-600">
          Titles, prices and files. Save a new one and it goes to the review queue rather than the storefront.
        </p>
      </header>

      <details className="w-full max-w-2xl">
        <summary className="cursor-pointer list-none rounded-lg bg-zinc-900 px-3.5 py-2 text-sm font-semibold text-white transition hover:bg-zinc-700">
          Add a title
        </summary>
        <div className="mt-3 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-zinc-200">
          <BookEditor isNew />
        </div>
      </details>

      <ul className="space-y-2">
        {drafts.map((book) => {
          const warning = FILE_WARNING[fileStatusFor(book.filePath || null)];
          return (
            <li key={book.id} className="rounded-2xl bg-white shadow-sm ring-1 ring-zinc-200">
              <details className="group">
                <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-3 px-5 py-3.5 transition hover:bg-zinc-50/60">
                  <div className="min-w-0">
                    <p className="truncate font-medium text-zinc-900">{book.title}</p>
                    <p className="mt-0.5 truncate font-mono text-xs text-zinc-500">
                      /books/{book.slug}
                      {warning ? <span className="ml-2 text-rose-600">· {warning}</span> : null}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-semibold tabular-nums text-zinc-900">
                      {formatINR(Number(book.price) * 100)}
                    </span>
                    <span className="text-xs text-zinc-400 group-hover:text-zinc-600">
                      {book.published ? 'Live' : 'Hidden'} · edit
                    </span>
                  </div>
                </summary>
                <div className="border-t border-dashed border-zinc-200 px-5 py-5">
                  <BookEditor book={book} />
                </div>
              </details>
            </li>
          );
        })}
        {drafts.length === 0 ? (
          <li className="rounded-2xl border border-dashed border-zinc-300 p-10 text-center text-sm text-zinc-500">
            No titles yet. Add one, or run <code className="text-zinc-700">npm run db:seed</code>.
          </li>
        ) : null}
      </ul>
    </div>
  );
}
