import Link from 'next/link';
import { listOfferedPaymentProviders } from '@/lib/payments/registry';
import { CARD_HOSTED_PROVIDER } from '@/lib/payments/types';

type NavItem = { href: string; label: string };

const LIGHT_NAV: NavItem[] = [
  { href: '/', label: 'Books' },
  { href: '/cafe', label: 'Cafe' },
  { href: '/admin', label: 'Staff' },
  { href: '/login', label: 'Sign in' },
];

/**
 * The footer states which methods the till actually has, so turning card checkout
 * off cannot leave a page promising a way to pay that no longer exists.
 */
function moneyFooter(): string {
  const cardOffered = listOfferedPaymentProviders().some((adapter) => adapter.id === CARD_HOSTED_PROVIDER);
  return cardOffered
    ? "Money goes to the merchant's own account — by UPI directly, or by card through their payment gateway. This site never sees your bank or card details, and never marks a payment as paid on its own."
    : 'Money goes to the shop’s own account, by UPI transferred straight to it. This site never sees your bank details, and never marks a payment as paid on its own.';
}

/**
 * Shared light chrome for the app surfaces (cafe, checkout, staff, login).
 * The ebook landing has its own dark shell in (bookstore)/layout.tsx.
 */
export function AppChrome({
  children,
  nav = LIGHT_NAV,
  brand = { mark: 'U', label: 'UPI Ordering', href: '/' },
  footer = moneyFooter(),
}: {
  children: React.ReactNode;
  nav?: NavItem[];
  brand?: { mark: string; label: string; href: string };
  footer?: string;
}) {
  return (
    <div className="flex min-h-full flex-col bg-zinc-50 text-zinc-900">
      <header className="border-b border-zinc-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-3.5 sm:px-6">
          <Link href={brand.href} className="flex items-center gap-2.5">
            <span className="grid size-8 place-items-center rounded-lg bg-zinc-900 text-sm font-bold text-white">
              {brand.mark}
            </span>
            <span className="text-sm font-semibold tracking-tight text-zinc-900">{brand.label}</span>
          </Link>
          <nav className="flex items-center gap-1 text-sm">
            {nav.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="rounded-lg px-2.5 py-1.5 font-medium text-zinc-600 transition hover:bg-zinc-100 hover:text-zinc-900"
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6 sm:px-6 sm:py-8">{children}</main>

      <footer className="border-t border-zinc-200 bg-white">
        <div className="mx-auto flex max-w-5xl flex-col gap-2 px-4 py-4 sm:px-6">
          <p className="text-xs text-zinc-500">{footer}</p>
          <p className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-zinc-500">
            <Link href="/refund-policy" className="underline-offset-2 hover:text-zinc-800 hover:underline">
              Refund policy
            </Link>
            <Link href="/complaints-policy" className="underline-offset-2 hover:text-zinc-800 hover:underline">
              Complaints
            </Link>
          </p>
        </div>
      </footer>
    </div>
  );
}
