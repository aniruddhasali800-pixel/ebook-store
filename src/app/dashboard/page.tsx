import { LiveActivity } from '@/components/LiveActivity';
import { PaymentStatus } from '@/components/PaymentStatus';
import { PaymentVerification, type VerificationRow } from '@/components/PaymentVerification';
import { verifyBookPaymentAction } from '@/lib/actions/dashboard';
import { activityFeed } from '@/lib/activity';
import { staffOrSignIn } from '@/lib/auth/guard';
import {
  countPendingCases,
  listBookReviewQueue,
  listComplaintInbox,
  listRefundQueue,
} from '@/lib/cases';
import {
  countOrdersByPaymentStatus,
  listOrdersByPaymentStatus,
  sumPaidInPaise,
} from '@/lib/payments/service';
import { formatINR } from '@/lib/money';
import type { PaymentStatus as PaymentStatusValue } from '@/lib/payments/status';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Shop dashboard' };

const stamp = new Intl.DateTimeFormat('en-IN', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: process.env.TZ ?? 'Asia/Kolkata',
});

export default async function DashboardPage() {
  const staff = await staffOrSignIn('/dashboard');
  const [pending, recent, counts, revenue, refunds, complaints, submitted, feed] = await Promise.all([
    listOrdersByPaymentStatus(['PAYMENT_VERIFICATION_PENDING'], 60, 'BOOKS'),
    listOrdersByPaymentStatus(['PAID', 'FAILED', 'CANCELLED'], 10, 'BOOKS'),
    countOrdersByPaymentStatus('BOOKS'),
    sumPaidInPaise('BOOKS'),
    listRefundQueue('BOOKS'),
    listComplaintInbox('BOOKS'),
    listBookReviewQueue(),
    activityFeed(14),
  ]);

  const refundCases = countPendingCases(refunds);
  const complaintCases = countPendingCases(complaints);

  const rows: VerificationRow[] = pending.map((order) => ({
    id: order.id,
    orderCode: order.orderId,
    customerLabel: order.customer.label,
    itemSummary: order.items.map((item) => item.name).join(', '),
    amountLabel: formatINR(order.totalInPaise),
    submittedAt: stamp.format(order.updatedAt),
    paymentStatus: order.paymentStatus as PaymentStatusValue,
    paymentReference: order.paymentReference,
    verifiedByName: order.verifiedBy?.name ?? null,
    upiIdUsed: order.upiIdUsed,
    paymentMethod: order.paymentMethod,
  }));

  return (
    <div className="space-y-7">
      <header>
        <h1 className="text-xl font-semibold tracking-tight text-zinc-900">Book shop</h1>
        <p className="mt-1 text-sm text-zinc-600">
          Signed in as {staff.name} · {staff.role === 'ADMIN' ? 'admin' : 'cashier'}. Payments
          waiting for you are below; refunds, complaints and new titles have their own queues.
        </p>
      </header>

      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <Stat label="Awaiting check" value={String(counts.PAYMENT_VERIFICATION_PENDING ?? 0)} tone="amber" href="/dashboard" />
        <Stat label="Unpaid" value={String(counts.PENDING ?? 0)} tone="zinc" href="/dashboard" />
        <Stat label="Paid orders" value={String(counts.PAID ?? 0)} tone="emerald" href="/dashboard" />
        <Stat label="Collected" value={formatINR(revenue)} tone="emerald" href="/dashboard" />
        <Stat
          label="Need an answer"
          value={String(refundCases.pending + complaintCases.pending)}
          tone={refundCases.overdue + complaintCases.overdue > 0 ? 'rose' : 'zinc'}
          href="/dashboard/refunds"
        />
      </dl>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <section className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
              Buyers who say they paid
            </h2>
            <LiveActivity initialEvents={feed} scope="BOOKS" />
          </div>
          <PaymentVerification
            rows={rows}
            action={verifyBookPaymentAction}
            emptyTitle="No ebook payments waiting"
            emptyBody="A claim lands here the moment a buyer taps “I’ve completed payment”."
          />
        </section>

        <aside className="space-y-3">
          <QueueLink
            href="/dashboard/refunds"
            title="Refunds"
            waiting={refundCases.pending}
            overdue={refundCases.overdue}
            body="Two working days to answer each request, counted from the day it arrived."
          />
          <QueueLink
            href="/dashboard/complaints"
            title="Complaints"
            waiting={complaintCases.pending}
            overdue={complaintCases.overdue}
            body="Every message from a receipt page, a book page or the cafe menu."
          />
          <QueueLink
            href="/dashboard/review"
            title="New titles"
            waiting={submitted.length}
            overdue={0}
            body="Submitted covers, prices and files wait here until an admin publishes them."
          />
        </aside>
      </div>

      <section className="space-y-3">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
          Recent decisions
        </h2>
        <div className="overflow-x-auto rounded-2xl bg-white shadow-sm ring-1 ring-zinc-200">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-zinc-200 text-xs uppercase tracking-wider text-zinc-500">
              <tr>
                <th className="px-4 py-2.5 font-medium">Order</th>
                <th className="px-4 py-2.5 font-medium">Title</th>
                <th className="px-4 py-2.5 font-medium">Amount</th>
                <th className="px-4 py-2.5 font-medium">Status</th>
                <th className="px-4 py-2.5 font-medium">Reference</th>
                <th className="px-4 py-2.5 font-medium">When</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {recent.map((order) => (
                <tr key={order.id}>
                  <td className="px-4 py-3 font-medium text-zinc-900">#{order.orderId}</td>
                  <td className="max-w-[220px] truncate px-4 py-3 text-zinc-700">
                    {order.items.map((item) => item.name).join(', ') || '—'}
                  </td>
                  <td className="px-4 py-3 tabular-nums text-zinc-700">
                    {formatINR(order.totalInPaise)}
                  </td>
                  <td className="px-4 py-3">
                    <PaymentStatus status={order.paymentStatus as PaymentStatusValue} />
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-zinc-600">
                    {order.paymentReference ?? '—'}
                  </td>
                  <td className="px-4 py-3 text-xs whitespace-nowrap text-zinc-500">
                    {stamp.format(order.updatedAt)}
                  </td>
                </tr>
              ))}
              {recent.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-center text-sm text-zinc-500">
                    Nothing decided yet.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
  href,
}: {
  label: string;
  value: string;
  tone: 'amber' | 'zinc' | 'emerald' | 'rose';
  href: string;
}) {
  const tones = {
    amber: 'text-amber-700',
    zinc: 'text-zinc-700',
    emerald: 'text-emerald-700',
    rose: 'text-rose-700',
  };
  return (
    <a
      href={href}
      className="rounded-xl bg-white px-4 py-3 shadow-sm ring-1 ring-zinc-200 transition hover:ring-zinc-300"
    >
      <dt className="text-xs font-medium uppercase tracking-wider text-zinc-500">{label}</dt>
      <dd className={`mt-1 text-2xl font-semibold tabular-nums ${tones[tone]}`}>{value}</dd>
    </a>
  );
}

function QueueLink({
  href,
  title,
  waiting,
  overdue,
  body,
}: {
  href: string;
  title: string;
  waiting: number;
  overdue: number;
  body: string;
}) {
  return (
    <a
      href={href}
      className="block rounded-2xl bg-white p-4 shadow-sm ring-1 ring-zinc-200 transition hover:ring-zinc-300"
    >
      <p className="flex items-baseline justify-between gap-2">
        <span className="font-semibold text-zinc-900">{title}</span>
        <span className="text-2xl font-semibold tabular-nums text-zinc-900">{waiting}</span>
      </p>
      {overdue > 0 ? (
        <p className="mt-0.5 text-xs font-medium text-rose-700">{overdue} past the promised date</p>
      ) : null}
      <p className="mt-1 text-[13px] leading-relaxed text-zinc-500">{body}</p>
    </a>
  );
}
