import { requireStaff } from '@/lib/auth/session';
import { activityFeed } from '@/lib/activity';
import { LiveActivity } from '@/components/LiveActivity';
import {
  countOrdersByPaymentStatus,
  listOrdersByPaymentStatus,
} from '@/lib/payments/service';
import { PaymentVerification, type VerificationRow } from '@/components/PaymentVerification';
import { PaymentStatus } from '@/components/PaymentStatus';
import { formatINR } from '@/lib/money';
import type { PaymentStatus as PaymentStatusValue } from '@/lib/payments/status';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Payment verification' };

const stamp = new Intl.DateTimeFormat('en-IN', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: process.env.TZ ?? 'Asia/Kolkata',
});

export default async function AdminVerificationPage() {
  const staff = await requireStaff();

  const [pending, recent, counts] = await Promise.all([
    listOrdersByPaymentStatus(['PAYMENT_VERIFICATION_PENDING'], 100),
    listOrdersByPaymentStatus(['PAID', 'FAILED', 'CANCELLED'], 12),
    countOrdersByPaymentStatus(),
  ]);

  const rows: VerificationRow[] = pending.map((order) => ({
    id: order.id,
    orderCode: order.orderId,
    customerLabel: order.customer.label,
    itemSummary: order.items
      .map((item) => `${item.name} × ${item.quantity}`)
      .join(', '),
    amountLabel: formatINR(order.totalInPaise),
    submittedAt: stamp.format(order.updatedAt),
    paymentStatus: order.paymentStatus as PaymentStatusValue,
    paymentReference: order.paymentReference,
    verifiedByName: order.verifiedBy?.name ?? null,
    // Safe to show staff: they need it to catch a swapped-payee scam.
    upiIdUsed: order.upiIdUsed,
    paymentMethod: order.paymentMethod,
  }));

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-xl font-semibold tracking-tight text-zinc-900">
          Payment verification
        </h1>
        <p className="mt-1 text-sm text-zinc-600">
          Signed in as {staff.name} ({staff.role.toLowerCase()}). Match each claim against the
          merchant UPI app or bank statement before marking it paid.
        </p>
      </header>

      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Awaiting check" value={counts.PAYMENT_VERIFICATION_PENDING ?? 0} tone="amber" />
        <Stat label="Not confirmed" value={counts.PENDING ?? 0} tone="zinc" />
        <Stat label="Paid" value={counts.PAID ?? 0} tone="emerald" />
        <Stat label="Failed / cancelled" value={(counts.FAILED ?? 0) + (counts.CANCELLED ?? 0)} tone="rose" />
      </dl>

      <LiveActivity initialEvents={activityFeed(14)} scope="CAFE" />

      <section className="space-y-3">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
          Customer-confirmed, waiting on staff
        </h2>
        <PaymentVerification rows={rows} />
      </section>

      <section className="space-y-3">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
          Recent decisions
        </h2>
        <div className="overflow-x-auto rounded-2xl bg-white shadow-sm ring-1 ring-zinc-200">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-zinc-200 text-xs uppercase tracking-wider text-zinc-500">
              <tr>
                <th className="px-4 py-2.5 font-medium">Order</th>
                <th className="px-4 py-2.5 font-medium">Amount</th>
                <th className="px-4 py-2.5 font-medium">Status</th>
                <th className="px-4 py-2.5 font-medium">Reference</th>
                <th className="px-4 py-2.5 font-medium">By / when</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {recent.map((order) => (
                <tr key={order.id}>
                  <td className="px-4 py-3 font-medium text-zinc-900">#{order.orderId}</td>
                  <td className="px-4 py-3 tabular-nums text-zinc-700">
                    {formatINR(order.totalInPaise)}
                  </td>
                  <td className="px-4 py-3">
                    <PaymentStatus status={order.paymentStatus as PaymentStatusValue} />
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-zinc-600">
                    {order.paymentReference ?? '—'}
                  </td>
                  <td className="px-4 py-3 text-xs text-zinc-500">
                    {order.verifiedBy?.name ?? '—'} · {stamp.format(order.updatedAt)}
                  </td>
                </tr>
              ))}
              {recent.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-sm text-zinc-500">
                    No decisions recorded yet.
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
}: {
  label: string;
  value: number;
  tone: 'amber' | 'zinc' | 'emerald' | 'rose';
}) {
  const tones = {
    amber: 'text-amber-700',
    zinc: 'text-zinc-700',
    emerald: 'text-emerald-700',
    rose: 'text-rose-700',
  } as const;

  return (
    <div className="rounded-xl bg-white px-4 py-3 shadow-sm ring-1 ring-zinc-200">
      <dt className="text-xs font-medium uppercase tracking-wider text-zinc-500">{label}</dt>
      <dd className={`mt-1 text-2xl font-semibold tabular-nums ${tones[tone]}`}>{value}</dd>
    </div>
  );
}
