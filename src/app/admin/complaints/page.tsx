import { ComplaintInbox } from '@/components/ComplaintInbox';
import { staffOrSignIn } from '@/lib/auth/guard';
import { countPendingCases, listComplaintInbox } from '@/lib/cases';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Cafe complaints' };

export default async function AdminComplaintsPage() {
  await staffOrSignIn('/admin/complaints');
  const rows = await listComplaintInbox('CAFE');
  const cases = countPendingCases(rows);

  return (
    <div className="space-y-5">
      <header className="space-y-1">
        <h1 className="text-xl font-semibold tracking-tight text-zinc-900">Complaints</h1>
        <p className="text-sm leading-relaxed text-zinc-600">
          Cafe orders and anything with no order attached. {cases.pending} open
          {cases.overdue > 0 ? ` · ${cases.overdue} older than the shop’s two working days` : ''}.
        </p>
      </header>

      <ComplaintInbox
        rows={rows}
        emptyTitle="Nothing in the cafe inbox"
        emptyBody="Messages from the menu page and from cafe receipts land here."
      />
    </div>
  );
}
