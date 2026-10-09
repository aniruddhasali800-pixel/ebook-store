import Link from 'next/link';
import { BookCover } from '@/components/BookCover';
import { BuyButton } from '@/components/BuyButton';
import { HeroSequence } from '@/components/HeroSequence';
import { coverUrlFor, listPublishedBooks } from '@/lib/books';
import { listOfferedPaymentProviders } from '@/lib/payments/registry';
import { formatINR } from '@/lib/money';

export const dynamic = 'force-dynamic';

const STEPS = (cardOffered: boolean) => [
  {
    title: 'Pick a title',
    body: 'One book per order, priced in rupees. No account, no cart, no upsell.',
  },
  {
    title: cardOffered ? 'Pay by UPI or card' : 'Pay our UPI directly',
    body: cardOffered
      ? 'Choose at the till. UPI gives you a QR coded with the exact amount and the shop’s own UPI ID; a card opens the payment gateway’s own checkout page, so no card number is ever entered here.'
      : 'The invoice page shows a QR coded with the exact amount and the shop’s own UPI ID. Scan it in Google Pay, PhonePe or Paytm, or tap to open the app.',
  },
  {
    title: 'Tell us you paid',
    body: 'Hit “I’ve completed payment”. That moves the order to verification pending — it does not, and cannot, mark it paid.',
  },
  {
    title: 'We confirm, you download',
    body: cardOffered
      ? 'A UPI payment is approved by someone at the shop after matching it against the bank statement; a card payment is confirmed by the gateway itself. The download link appears on the same page.'
      : 'Someone at the shop matches your transaction against the bank statement and approves it. The download link appears on the same page.',
  },
];

export default async function BookstoreHome() {
  const [books, providers] = await Promise.all([
    listPublishedBooks(),
    listOfferedPaymentProviders(),
  ]);
  const steps = STEPS(providers.length > 1);

  return (
    <>
      <HeroSequence cardOffered={providers.length > 1} />

      <section id="titles" className="mx-auto max-w-6xl scroll-mt-20 px-5 py-20 sm:px-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="font-mono text-[11px] tracking-[0.22em] text-amber-300/80 uppercase">
              The library
            </p>
            <h2 className="mt-2 text-3xl font-semibold tracking-tight text-white sm:text-4xl">
              Three handbooks. Buy once.
            </h2>
          </div>
          <p className="max-w-xs text-sm leading-relaxed text-zinc-500">
            Every price below is what the QR asks for — no GST line added at the end, no subscription.
          </p>
        </div>

        {books.length === 0 ? (
          <p className="mt-10 rounded-xl border border-white/10 px-5 py-10 text-center text-sm text-zinc-500">
            Nothing is on sale yet. Run <code className="text-zinc-300">npm run db:seed</code> or add
            a title from the shop dashboard.
          </p>
        ) : (
          <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {books.map((book) => (
              <article
                key={book.id}
                className="group flex flex-col rounded-2xl border border-white/10 bg-white/[0.025] p-5 transition hover:border-white/20 hover:bg-white/[0.05]"
              >
                <div className="[perspective:900px]">
                  <BookCover
                    title={book.title}
                    author={book.author}
                    imageSrc={coverUrlFor(book.coverPath)}
                    className="w-32 transition-transform duration-500 ease-out group-hover:[transform:rotateY(-14deg)_translateZ(20px)]"
                  />
                </div>

                <p className="mt-5 font-mono text-[10px] tracking-[0.2em] text-zinc-500 uppercase">
                  {book.category} · {book.pages ? `${book.pages} pages` : book.format}
                </p>
                <h3 className="mt-1.5 text-lg leading-snug font-semibold tracking-tight text-white">
                  {book.title}
                </h3>
                <p className="mt-1 text-[13px] text-zinc-400">{book.subtitle}</p>
                <p className="mt-3 line-clamp-3 text-[13px] leading-relaxed text-zinc-500">
                  {book.blurb}
                </p>

                <div className="mt-5 flex items-baseline gap-2">
                  <span className="text-xl font-semibold text-white tabular-nums">
                    {formatINR(book.priceInPaise)}
                  </span>
                  {book.listPriceInPaise && book.listPriceInPaise > book.priceInPaise ? (
                    <span className="text-sm text-zinc-600 line-through tabular-nums">
                      {formatINR(book.listPriceInPaise)}
                    </span>
                  ) : null}
                </div>

                <div className="mt-4 space-y-2">
                  <BuyButton
                    bookId={book.id}
                    label={providers.length > 1 ? 'Buy now' : 'Buy with UPI'}
                    providers={providers}
                  />
                  <Link
                    href={`/books/${book.slug}`}
                    className="block rounded-xl px-4 py-2 text-center text-[13px] font-medium text-zinc-400 transition hover:bg-white/5 hover:text-zinc-100"
                  >
                    Look inside
                  </Link>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <section id="how" className="border-y border-white/10 bg-[#0e0d0c]">
        <div className="mx-auto max-w-6xl scroll-mt-20 px-5 py-20 sm:px-8">
          <p className="font-mono text-[11px] tracking-[0.22em] text-amber-300/80 uppercase">
            How payment works
          </p>
          <h2 className="mt-2 max-w-2xl text-3xl font-semibold tracking-tight text-white sm:text-4xl">
            {providers.length > 1
              ? 'Paid straight to the shop, and only called paid when it is.'
              : 'Direct UPI, verified by a human.'}
          </h2>
          <div className="mt-12 grid gap-x-8 gap-y-10 sm:grid-cols-2 lg:grid-cols-4">
            {steps.map((step, index) => (
              <div key={step.title}>
                <span className="grid size-8 place-items-center rounded-full border border-amber-300/30 bg-amber-300/10 font-mono text-[13px] text-amber-200">
                  {index + 1}
                </span>
                <h3 className="mt-4 text-[15px] font-semibold text-white">{step.title}</h3>
                <p className="mt-2 text-[13px] leading-relaxed text-zinc-400">{step.body}</p>
              </div>
            ))}
          </div>
          <p className="mt-12 max-w-2xl border-l-2 border-amber-300/40 pl-4 text-sm leading-relaxed text-zinc-400">
            A QR code, an opened payment app or a clicked button are all claims that money moved —
            none of them is proof.{' '}
            {providers.length > 1 ? (
              <>
                A card payment counts only when the gateway itself reports back, and a UPI transfer
                reaches this shop as nothing but a claim — so a person at the shop has to match it
                against the bank statement. Until then, an order reads{' '}
              </>
            ) : (
              <>
                This shop has no gateway to confirm against, so it says so: an order reads{' '}
              </>
            )}
            <span className="text-zinc-200">verification pending</span>.
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-5 py-20 sm:px-8">
        <div className="flex flex-col items-start justify-between gap-6 rounded-2xl border border-white/10 bg-gradient-to-br from-white/[0.06] to-transparent p-8 sm:flex-row sm:items-center sm:p-10">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight text-white">
              Want all three together?
            </h2>
            <p className="mt-1.5 text-sm text-zinc-400">
              Buy them one at a time — the shop has no bundles yet, and no recurring charge ever.
            </p>
          </div>
          <a
            href="#titles"
            className="shrink-0 rounded-xl bg-gradient-to-b from-amber-300 to-amber-500 px-5 py-3 text-sm font-semibold text-[#231603] shadow-lg shadow-amber-500/20 transition hover:from-amber-200 hover:to-amber-400"
          >
            Back to the library
          </a>
        </div>
      </section>
    </>
  );
}
