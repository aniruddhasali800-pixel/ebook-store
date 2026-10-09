import { requireStaff } from '@/lib/auth/session';
import { InventoryBoard } from '@/components/InventoryBoard';
import { booksSoldLedger, listStock, menuItemsForStock, recentMovements } from '@/lib/inventory/stock';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Inventory' };

export default async function InventoryPage() {
  // requireStaff() proves the session is real; the role check below is what makes
  // this admin-only. The actions on the page check the same thing again, because a
  // page can hide a form but cannot protect the route behind it.
  const staff = await requireStaff();

  if (staff.role !== 'ADMIN') {
    return (
      <div className="max-w-xl space-y-3 rounded-2xl bg-white p-6 shadow-sm ring-1 ring-zinc-200">
        <h1 className="text-xl font-semibold tracking-tight text-zinc-900">Inventory</h1>
        <p className="text-sm leading-relaxed text-zinc-600">
          Stock counts and reorder levels belong to the admin who owns the buying. Your role can verify
          payments and move orders through the kitchen; nothing here is shown to a cashier, and no
          count can be recorded from your sign-in.
        </p>
        <p className="text-sm text-zinc-500">
          If a shelf is empty during your shift, tell an admin — the order you are verifying will still
          go through either way, because the money arriving is the fact and the count is bookkeeping.
        </p>
      </div>
    );
  }

  const [rows, movements, books, menuItems] = await Promise.all([
    listStock(),
    recentMovements(30),
    booksSoldLedger(),
    menuItemsForStock(),
  ]);

  return (
    <div className="space-y-6">
      <header className="max-w-3xl">
        <h1 className="text-xl font-semibold tracking-tight text-zinc-900">Inventory</h1>
        <p className="mt-1.5 text-sm leading-relaxed text-zinc-600">
          What the shop has, and what it cannot sell again until somebody restocks it. A count only moves
          when an order is marked paid by a person who has looked at the statement — a customer tapping
          &ldquo;I&apos;ve Completed Payment&rdquo; is a claim, and a claim does not empty a shelf.
        </p>
        <p className="mt-1.5 text-sm leading-relaxed text-zinc-500">
          {rows.length === 0
            ? 'Nothing is tracked yet, so paid orders are changing no numbers. Add the first item below.'
            : `${rows.length} item${rows.length === 1 ? '' : 's'} tracked. Every change below is written to a ledger that keeps the order it came from.`}
        </p>
      </header>

      <InventoryBoard rows={rows} movements={movements} books={books} menuItems={menuItems} />
    </div>
  );
}
