import Link from 'next/link';
import { VisitorBeacon } from '@/components/VisitorBeacon';
import { listOfferedPaymentProviders } from '@/lib/payments/registry';
import { CARD_HOSTED_PROVIDER } from '@/lib/payments/types';

const NAV = [
  { href: '/#titles', label: 'Library' },
  { href: '/#how', label: 'How it works' },
  { href: '/cafe', label: 'Cafe', muted: true },
  { href: '/dashboard', label: 'Dashboard', muted: true },
];

/** Dark marketing shell — the bookstore owns the whole viewport, no app chrome. */
export default async function BookstoreLayout({ children }: { children: React.ReactNode }) {
  const cardOffered = listOfferedPaymentProviders().some((adapter) => adapter.id === CARD_HOSTED_PROVIDER);
  return (
    <div className="flex min-h-full flex-col bg-[#0b0a09] text-zinc-100">
      <header className="sticky top-0 z-50 border-b border-white/10 bg-[#0b0a09]/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-3.5 sm:px-8">
          <Link href="/" className="group flex items-center gap-2.5">
            <span className="grid size-8 place-items-center rounded-lg bg-gradient-to-br from-amber-300 to-amber-600 text-[13px] font-black text-[#1a1206] shadow-[0_0_20px_-4px] shadow-amber-500/60">
              S
            </span>
            <span className="text-[15px] font-semibold tracking-tight text-white">
              Super AI Books
            </span>
          </Link>
          <nav className="flex items-center gap-0.5 text-[13px]">
            {NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={
                  item.muted
                    ? 'hidden rounded-lg px-2.5 py-1.5 font-medium text-zinc-500 transition hover:text-zinc-200 sm:block'
                    : 'rounded-lg px-2.5 py-1.5 font-medium text-zinc-300 transition hover:bg-white/5 hover:text-white'
                }
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </div>
      </header>

      <div className="flex-1">{children}</div>
      <VisitorBeacon />

      <footer className="border-t border-white/10 bg-[#0b0a09]">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 px-5 py-7 text-xs text-zinc-500 sm:px-8">
          <p className="font-medium text-zinc-400">Super AI Books — pay direct, own the file.</p>
          <p className="max-w-2xl leading-relaxed">
            Money goes to the shop&apos;s own account: straight UPI
            {cardOffered ? ', or card through the payment gateway' : ''}. Your download unlocks once
            the payment is confirmed — the site never marks a payment as paid on its own.
          </p>
          <p className="flex flex-wrap gap-x-4 gap-y-1">
            <Link href="/refund-policy" className="underline-offset-2 hover:text-zinc-300 hover:underline">
              Refund policy
            </Link>
            <Link href="/complaints-policy" className="underline-offset-2 hover:text-zinc-300 hover:underline">
              Complaints
            </Link>
          </p>
        </div>
      </footer>
    </div>
  );
}
