import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getSessionPayload } from '@/lib/auth/session';
import { SignOutButton } from '@/components/LoginForm';
import { AppChrome } from '@/components/AppChrome';

export const dynamic = 'force-dynamic';

const TABS: { href: string; label: string; adminOnly?: boolean }[] = [
  { href: '/admin', label: 'Verification' },
  { href: '/admin/refunds', label: 'Refunds' },
  { href: '/admin/complaints', label: 'Complaints' },
  { href: '/admin/kitchen', label: 'Kitchen' },
  // Hidden from a cashier because the page behind it shows them nothing; the route
  // still checks the role itself, so this is tidiness and not a defence.
  { href: '/admin/inventory', label: 'Inventory', adminOnly: true },
  { href: '/admin/settings', label: 'Payment settings' },
];

/**
 * Optimistic cookie gate for the whole staff area. Every page under it re-checks
 * the user row with requireStaff(), and so does every action, so this layout can
 * only ever be the first line of defence — never the only one.
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await getSessionPayload();
  // A layout cannot see which tab it is wrapping, so the deepest destination it
  // can hand back to the sign-in page is the staff area root.
  if (!session) redirect('/login?next=%2Fadmin');

  return (
    <AppChrome
      brand={{ mark: 'U', label: 'Staff area', href: '/admin' }}
      footer="Cafe staff only. The ebook shop dashboard lives at /dashboard."
    >
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <nav className="flex flex-wrap gap-1 rounded-xl bg-white p-1 ring-1 ring-zinc-200">
            {TABS.filter((tab) => !tab.adminOnly || session.role === 'ADMIN').map((tab) => (
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
