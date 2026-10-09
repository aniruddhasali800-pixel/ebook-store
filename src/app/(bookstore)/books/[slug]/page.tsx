import Link from 'next/link';
import { notFound } from 'next/navigation';
import { BookCover } from '@/components/BookCover';
import { BuyButton } from '@/components/BuyButton';
import { ComplaintBox } from '@/components/ComplaintBox';
import { findBookBySlug, coverUrlFor } from '@/lib/books';
import { listOfferedPaymentProviders } from '@/lib/payments/registry';
import { formatINR } from '@/lib/money';
import { PAY_WINDOW_MINUTES } from '@/lib/pay/window';

export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const book = await findBookBySlug(slug);
  if (!book) return { title: 'Title not found' };
  return { title: book.title, description: book.blurb };
}

export default async function BookDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const [book, providers] = await Promise.all([
    findBookBySlug(slug),
    Promise.resolve(listOfferedPaymentProviders()),
  ]);
  if (!book) notFound();

  const contents = (book.contents ?? '').split('\n').filter(Boolean);

  return (
    <div className="mx-auto max-w-6xl px-5 py-14 sm:px-8 sm:py-20">
      <Link
        href="/#titles"
        className="font-mono text-[11px] tracking-[0.18em] text-zinc-500 uppercase transition hover:text-zinc-300"
      >
        ← The library
      </Link>

      <div className="mt-8 grid gap-12 lg:grid-cols-[280px_1fr]">
        <div className="[perspective:1100px]">
          <BookCover
            title={book.title}
            author={book.author}
            imageSrc={coverUrlFor(book.coverPath)}
            className="w-full max-w-[280px] transition-transform duration-700 ease-out hover:[transform:rotateY(-12deg)]"
          />
        </div>

        <div className="max-w-2xl">
          <p className="font-mono text-[11px] tracking-[0.2em] text-amber-300/80 uppercase">
            {book.category}
          </p>
          <h1 className="mt-3 text-4xl leading-[1.05] font-semibold tracking-tight text-white">
            {book.title}
          </h1>
          <p className="mt-2.5 text-lg text-zinc-400">{book.subtitle}</p>
          <p className="mt-1 text-sm text-zinc-500">
            {book.author} · {book.pages} pages · {book.format}
          </p>

          <p className="mt-7 text-[15px] leading-relaxed text-zinc-300">{book.blurb}</p>

          {contents.length > 0 ? (
            <section className="mt-9">
              <h2 className="text-[11px] font-semibold tracking-[0.18em] text-zinc-500 uppercase">
                What is inside
              </h2>
              <ul className="mt-3 space-y-2.5">
                {contents.map((line) => (
                  <li key={line} className="flex gap-3 text-[15px] leading-relaxed text-zinc-300">
                    <span className="mt-2 size-1.5 shrink-0 rounded-full bg-amber-300/70" />
                    {line}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <section className="mt-10 rounded-2xl border border-white/10 bg-white/[0.03] p-6">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <p className="text-[11px] tracking-[0.18em] text-zinc-500 uppercase">Price</p>
                <p className="mt-1 flex items-baseline gap-2.5">
                  <span className="text-3xl font-semibold text-white tabular-nums">
                    {formatINR(book.priceInPaise)}
                  </span>
                  {book.listPriceInPaise && book.listPriceInPaise > book.priceInPaise ? (
                    <span className="text-base text-zinc-600 line-through tabular-nums">
                      {formatINR(book.listPriceInPaise)}
                    </span>
                  ) : null}
                </p>
              </div>
              <div className="w-full max-w-[260px]">
                <BuyButton
                  bookId={book.id}
                  label={providers.length > 1 ? 'Buy now' : `Buy ${book.title} with UPI`}
                  providers={providers}
                />
              </div>
            </div>
            <p className="mt-4 text-[13px] leading-relaxed text-zinc-500">
              {providers.length > 1
                ? 'Pick UPI or card at the till. Either way you land on a payment page for this exact amount, and the download unlocks only once the payment is confirmed — a card by the gateway, the UPI transfer by someone at the shop — until then the page says verification pending, never “paid”.'
                : 'You get a payment page with a QR code for this exact amount. The download unlocks after the shop confirms the transaction — until then the page says verification pending, never “paid”.'}
              {' '}The shop holds a payment request for {PAY_WINDOW_MINUTES} minutes; after that the page says so,
              and nothing is cancelled on you.
            </p>
          </section>

          {/* Something wrong with this book, or a question about it? This is the
              shortest path to a person at the shop, and it works without an order. */}
          <div className="mt-8">
            <ComplaintBox bookId={book.id} existing={[]} />
          </div>
        </div>
      </div>
    </div>
  );
}
