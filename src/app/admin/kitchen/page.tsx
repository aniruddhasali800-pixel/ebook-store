import Link from 'next/link';
import { requireStaff } from '@/lib/auth/session';
import { listKitchenOrders } from '@/lib/payments/service';
import { advanceOrderStatusAction } from '@/lib/actions/staff';
import { OrderStatusTag } from '@/components/PaymentStatus';
import { formatINR } from '@/lib/money';
import type { OrderStatus } from '@/lib/payments/status';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Kitchen' };

const NEXT_LABEL: Record<string, string> = {
  READY: 'Mark ready',
  COMPLETED: 'Mark completed',
};

export default async function KitchenPage() {
  await requireStaff();
  const orders = await listKitchenOrders();

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-xl font-semibold tracking-tight text-zinc-900">Kitchen queue</h1>
        <p className="mt-1 text-sm text-zinc-600">
          Only orders whose payment a staff member has confirmed land here.
        </p>
      </header>

      {orders.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-zinc-300 bg-white/60 p-10 text-center">
          <p className="font-medium text-zinc-700">No orders to prepare</p>
          <p className="mt-1 text-sm text-zinc-500">
            Verify a payment on the{' '}
            <Link href="/admin" className="underline underline-offset-2">
              verification board
            </Link>{' '}
            and it will appear here.
          </p>
        </div>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {orders.map((order) => (
            <li key={order.id} className="flex flex-col rounded-2xl bg-white p-5 shadow-sm ring-1 ring-zinc-200">
              <div className="flex items-start justify-between gap-2">
                <p className="font-semibold text-zinc-900">#{order.orderId}</p>
                <OrderStatusTag status={order.status as OrderStatus} />
              </div>
              <p className="mt-1 text-sm text-zinc-600">{order.customer.label}</p>

              <ul className="mt-3 flex-1 space-y-1.5 text-sm">
                {order.items.map((item) => (
                  <li key={item.id} className="flex justify-between gap-3">
                    <span className="min-w-0 truncate text-zinc-800">
                      <span className="font-semibold tabular-nums">{item.quantity}×</span>{' '}
                      {item.name}
                    </span>
                    <span className="tabular-nums text-zinc-500">
                      {formatINR(item.lineTotalInPaise)}
                    </span>
                  </li>
                ))}
              </ul>

              {order.note ? (
                <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900 ring-1 ring-amber-200">
                  {order.note}
                </p>
              ) : null}

              <form action={advanceOrderStatusAction} className="mt-4">
                <input type="hidden" name="orderId" value={order.id} />
                <input type="hidden" name="next" value={order.status === 'IN_KITCHEN' ? 'READY' : 'COMPLETED'} />
                <button
                  type="submit"
                  className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-semibold text-zinc-800 hover:bg-zinc-50"
                >
                  {NEXT_LABEL[order.status === 'IN_KITCHEN' ? 'READY' : 'COMPLETED']}
                </button>
              </form>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
