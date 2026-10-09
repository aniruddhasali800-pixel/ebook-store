import { BookReviewQueue } from '@/components/BookReviewQueue';
import { staffOrSignIn } from '@/lib/auth/guard';
import { listBookReviewQueue } from '@/lib/cases';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Title review' };

export default async function DashboardReviewPage() {
  const staff = await staffOrSignIn('/dashboard/review');
  const rows = await listBookReviewQueue();

  return (
    <div className="space-y-5">
      <header className="space-y-1">
        <h1 className="text-xl font-semibold tracking-tight text-zinc-900">Waiting for review</h1>
        <p className="text-sm leading-relaxed text-zinc-600">
          {rows.length} submitted {rows.length === 1 ? 'title' : 'titles'}. A new title is hidden from the shop until
          somebody checks its cover, its file and its price here.
        </p>
        {staff.role !== 'ADMIN' ? (
          <p className="text-[13px] leading-relaxed text-amber-700">
            You are signed in as a cashier, so this queue is read-only for you — publishing puts a book on sale.
          </p>
        ) : null}
      </header>

      <BookReviewQueue rows={rows} isAdmin={staff.role === 'ADMIN'} />
    </div>
  );
}
