import {
  PAYMENT_STATUS_LABELS,
  type OrderStatus,
  type PaymentStatus as PaymentStatusValue,
} from '@/lib/payments/status';

const TONES: Record<PaymentStatusValue, string> = {
  PENDING: 'bg-zinc-100 text-zinc-700 ring-zinc-200',
  PAYMENT_VERIFICATION_PENDING: 'bg-amber-50 text-amber-800 ring-amber-200',
  PAID: 'bg-emerald-50 text-emerald-800 ring-emerald-200',
  FAILED: 'bg-rose-50 text-rose-800 ring-rose-200',
  CANCELLED: 'bg-zinc-100 text-zinc-500 ring-zinc-200',
};

const ORDER_TONES: Record<OrderStatus, string> = {
  AWAITING_PAYMENT: 'bg-zinc-100 text-zinc-700 ring-zinc-200',
  IN_KITCHEN: 'bg-sky-50 text-sky-800 ring-sky-200',
  READY: 'bg-emerald-50 text-emerald-800 ring-emerald-200',
  COMPLETED: 'bg-zinc-100 text-zinc-500 ring-zinc-200',
  CANCELLED: 'bg-rose-50 text-rose-800 ring-rose-200',
};

const ORDER_LABELS: Record<OrderStatus, string> = {
  AWAITING_PAYMENT: 'Awaiting payment',
  IN_KITCHEN: 'In kitchen',
  READY: 'Ready',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
};

export function PaymentStatus({
  status,
  label,
}: {
  status: PaymentStatusValue;
  label?: string;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${TONES[status]}`}
    >
      <span className="size-1.5 rounded-full bg-current opacity-70" aria-hidden />
      {label ?? PAYMENT_STATUS_LABELS[status]}
    </span>
  );
}

export function OrderStatusTag({ status }: { status: OrderStatus }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${ORDER_TONES[status]}`}
    >
      {ORDER_LABELS[status]}
    </span>
  );
}

export { ORDER_LABELS };
