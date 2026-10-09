/**
 * The vocabularies for the two review queues, in a module with no server imports.
 *
 * Same reason `src/lib/payments/status.ts` exists: a Client Component needs the
 * status names and their human labels, and it must not drag in Prisma or a
 * `server-only` module to get them. The transition rules that go with these live in
 * `refunds.ts` and `case-log.ts`, which stay on the server.
 */

export const REFUND_STATUSES = ['REQUESTED', 'APPROVED', 'REFUNDED', 'REJECTED'] as const;
export type RefundStatus = (typeof REFUND_STATUSES)[number];

export const REFUND_STATUS_LABELS: Record<RefundStatus, string> = {
  REQUESTED: 'Refund requested',
  APPROVED: 'Approved, payout pending',
  REFUNDED: 'Paid back',
  REJECTED: 'Refused',
};

export const COMPLAINT_STATUSES = ['OPEN', 'ANSWERED', 'CLOSED'] as const;
export type ComplaintStatus = (typeof COMPLAINT_STATUSES)[number];

export const COMPLAINT_STATUS_LABELS: Record<ComplaintStatus, string> = {
  OPEN: 'Open',
  ANSWERED: 'Answered',
  CLOSED: 'Closed',
};

/** Shared pill styling for a case status. */
export function caseStatusTone(status: string): string {
  switch (status) {
    case 'REFUNDED':
    case 'ANSWERED':
      return 'bg-emerald-50 text-emerald-700 ring-emerald-200';
    case 'APPROVED':
      return 'bg-sky-50 text-sky-800 ring-sky-200';
    case 'REQUESTED':
    case 'OPEN':
      return 'bg-amber-50 text-amber-800 ring-amber-200';
    case 'REJECTED':
      return 'bg-rose-50 text-rose-700 ring-rose-200';
    default:
      return 'bg-zinc-100 text-zinc-600 ring-zinc-200';
  }
}
