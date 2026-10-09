import { RefundQueue } from '@/components/RefundQueue';
import { staffOrSignIn } from '@/lib/auth/guard';
import { countPendingCases, listRefundQueue } from '@/lib/cases';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Cafe refunds' };

export default async function AdminRefundsPage() {
  await staffOrSignIn('/admin/refunds');
  const rows = await listRefundQueue('CAFE');
  const cases = countPendingCases(rows);

  return (
    <div className="space-y-5">
      <header className="space-y-1">
        <h1 className="text-xl font-semibold tracking-tight text-zinc-900">Refunds</h1>
        <p className="text-sm leading-relaxed text-zinc-600">
          Cafe orders only — the book shop’s refunds live in its own queue. {cases.pending} waiting
          {cases.overdue > 0 ? `, ${cases.overdue} past the date promised` : ''}.
        </p>
      </header>

      <RefundQueue
        rows={rows}
        emptyTitle="No cafe refunds waiting"
        emptyBody="A buyer asks from their receipt page; it arrives here."
      />
    </div>
  );
}
