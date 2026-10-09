import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getSessionPayload } from '@/lib/auth/session';
import { SignOutButton } from '@/components/LoginForm';
import { AppChrome } from '@/components/AppChrome';

export const dynamic = 'force-dynamic';

const TABS = [
  { href: '/dashboard', label: 'Payments' },
  { href: '/dashboard/refunds', label: 'Refunds' },
  { href: '/dashboard/complaints', label: 'Complaints' },
  { href: '/dashboard/review', label: 'Review' },
  { href: '/dashboard/books', label: 'Catalogue' },
];

/**
 * The book shop’s staff area, behind the same sign-in as the cafe.
 *
 * This used to be open to anyone with the address. It cannot stay that way now that
 * the queues hold customer names, complaint text and refund amounts, so the layout
 * gates on the session cookie — and every page and action under it re-checks the
 * user row, because a cookie is only ever an optimistic claim.
 */
export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await getSessionPayload();
  if (!session) redirect('/login?next=%2Fdashboard');

  return (
    <AppChrome
      brand={{ mark: 'S', label: 'Shop dashboard', href: '/dashboard' }}
      nav={[
        { href: '/', label: 'Shop' },
        { href: '/admin', label: 'Cafe staff' },
      ]}
      footer="Book shop staff. Refunds and complaints here are the shop’s own records — no money moves from this screen."
    >
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <nav className="flex flex-wrap gap-1 rounded-xl bg-white p-1 ring-1 ring-zinc-200">
            {TABS.map((tab) => (
              <Link
                key={tab.href}
                href={tab.href}
                className="rounded-lg px-3 py-1.5 text-sm font-medium text-zinc-600 transition hover:bg-zinc-100 hover:text-zinc-900"
              >
                {tab.label}
              </Link>
            ))}
          </nav>
          <SignOutButton />
        </div>
        {children}
      </div>
    </AppChrome>
  );
}
