import { ComplaintInbox } from '@/components/ComplaintInbox';
import { staffOrSignIn } from '@/lib/auth/guard';
import { countPendingCases, listComplaintInbox } from '@/lib/cases';
import { REFUND_REVIEW_WORKING_DAYS } from '@/lib/refunds';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Complaint inbox' };

export default async function DashboardComplaintsPage() {
  await staffOrSignIn('/dashboard/complaints');
  const rows = await listComplaintInbox('BOOKS');
  const cases = countPendingCases(rows);

  return (
    <div className="space-y-5">
      <header className="space-y-1">
        <h1 className="text-xl font-semibold tracking-tight text-zinc-900">Complaints</h1>
        <p className="text-sm leading-relaxed text-zinc-600">
          {cases.pending} open {cases.overdue > 0 ? `· ${cases.overdue} older than the ${REFUND_REVIEW_WORKING_DAYS} working days this shop promises` : ''}.
        </p>
        <p className="text-[13px] leading-relaxed text-zinc-500">
          What you write here is exactly what the buyer reads — on their receipt page if they have one, or on the
          status link they were given. A complaint cannot move money or mark anything delivered; it only reaches a
          person, which is the point of it.
        </p>
      </header>

      <ComplaintInbox rows={rows} />
    </div>
  );
}
