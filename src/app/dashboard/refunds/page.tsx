import { RefundQueue } from '@/components/RefundQueue';
import { staffOrSignIn } from '@/lib/auth/guard';
import { countPendingCases, listRefundQueue } from '@/lib/cases';
import { REFUND_REQUEST_WINDOW_HOURS, REFUND_REVIEW_WORKING_DAYS } from '@/lib/refunds';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Refund queue' };

export default async function DashboardRefundsPage() {
  await staffOrSignIn('/dashboard/refunds');
  const rows = await listRefundQueue('BOOKS');
  const cases = countPendingCases(rows);

  return (
    <div className="space-y-5">
      <header className="space-y-1">
        <h1 className="text-xl font-semibold tracking-tight text-zinc-900">Refunds</h1>
        <p className="text-sm leading-relaxed text-zinc-600">
          A buyer has {REFUND_REQUEST_WINDOW_HOURS} hours from the moment their payment was confirmed to ask, and
          this shop answers within {REFUND_REVIEW_WORKING_DAYS} working days. {cases.pending} waiting
          {cases.overdue > 0 ? `, ${cases.overdue} past the date promised` : ''}.
        </p>
        <p className="text-[13px] leading-relaxed text-zinc-500">
          Nothing here moves money. Approving a refund means opening your own UPI or banking app, sending it, and
          then typing the transfer reference — only that reference lets this site say “paid back”.
        </p>
      </header>

      <RefundQueue rows={rows} />
    </div>
  );
}
