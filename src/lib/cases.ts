import 'server-only';
import { prisma } from '@/lib/db';
import { coverUrlFor, fileStatusFor } from '@/lib/books';
import { formatINR } from '@/lib/money';
import { COMPLAINT_STATUS_LABELS, type ComplaintStatus } from '@/lib/case-log';
import {
  REFUND_CUSTOMER_COPY,
  REFUND_REFUSALS,
  REFUND_STATUS_LABELS,
  refundEligibility,
  reviewDeadlineAt,
  type RefundStatus,
} from '@/lib/refunds';

/**
 * Everything the refund and complaint screens need, computed in one place.
 *
 * Dates are formatted here rather than in the browser because the shop and the
 * buyer must read the same deadline: a client-side `toLocaleString` would show a
 * customer in Mumbai and a staffer in London different "due" times for one clock.
 */

const timeZone = process.env.TZ ?? 'Asia/Kolkata';
const stamp = new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short', timeZone });
const dayStamp = new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeZone });

/** What the buyer sees about one refund on their receipt page. */
export type RefundView = {
  status: RefundStatus;
  requestedLabel: string;
  dueLabel: string;
  decisionLabel: string;
  copy: string;
  note: string | null;
  reference: string | null;
};

export type RefundPanelProps = {
  token: string;
  amountLabel: string;
  /** Null when a new request is allowed; otherwise the reason it is not. */
  blockedReason: string | null;
  requestUntilLabel: string | null;
  history: RefundView[];
};

export type ComplaintView = {
  id: string;
  subject: string;
  body: string;
  statusLabel: string;
  createdAtLabel: string;
  reply: string | null;
  answeredLabel: string | null;
};

/** The staff-side row: enough to decide without opening the order. */
export type RefundQueueRow = {
  id: string;
  orderId: string;
  orderCode: string;
  orderToken: string;
  channel: string;
  customerLabel: string;
  amountLabel: string;
  reason: string;
  payoutVpa: string | null;
  status: RefundStatus;
  decisionLabel: string;
  requestedLabel: string;
  dueLabel: string;
  /** The shop has run past the deadline it promised. */
  overdue: boolean;
  decisionNote: string | null;
  payoutReference: string | null;
  reviewedByName: string | null;
};

export type ComplaintInboxRow = {
  id: string;
  subject: string;
  body: string;
  fromName: string;
  contact: string | null;
  source: string;
  status: ComplaintStatus;
  statusLabel: string;
  createdAtLabel: string;
  orderCode: string | null;
  orderToken: string | null;
  bookTitle: string | null;
  reply: string | null;
  answeredLabel: string | null;
  answeredByName: string | null;
  viewToken: string | null;
  /** Older than the two working days the complaint policy promises. */
  overdue: boolean;
};

/** The buyer's refund panel, including whether another request is allowed. */
export async function refundPanelProps(order: {
  id: string;
  token: string;
  paymentStatus: string;
  paidAt: Date | null;
  totalInPaise: number;
}, now = new Date()): Promise<RefundPanelProps> {
  const refunds = await prisma.refundRequest.findMany({
    where: { orderId: order.id },
    orderBy: { requestedAt: 'desc' },
  });

  const eligibility = refundEligibility({ ...order, refunds }, now);
  const history: RefundView[] = refunds.map((refund) => ({
    status: refund.status as RefundStatus,
    requestedLabel: stamp.format(refund.requestedAt),
    dueLabel: stamp.format(refund.reviewDueAt),
    decisionLabel: REFUND_STATUS_LABELS[refund.status as RefundStatus],
    copy: refundCustomerCopyFor(refund.status as RefundStatus, refund.reviewDueAt),
    note: refund.decisionNote,
    reference: refund.payoutReference,
  }));

  return {
    token: order.token,
    amountLabel: formatINR(order.totalInPaise),
    blockedReason: eligibility.eligible ? null : REFUND_REFUSALS[eligibility.reason],
    requestUntilLabel: eligibility.eligible
      ? stamp.format(eligibility.requestUntil)
      : eligibility.requestUntil
        ? stamp.format(eligibility.requestUntil)
        : null,
    history,
  };
}

/**
 * The APPROVED line names the date the shop owes the money by, which is the only
 * part of a promise a customer can check afterwards.
 */
function refundCustomerCopyFor(status: RefundStatus, dueAt: Date): string {
  if (status === 'REQUESTED') return REFUND_CUSTOMER_COPY.REQUESTED;
  if (status === 'APPROVED') {
    return `${REFUND_CUSTOMER_COPY.APPROVED} The shop committed to an answer by ${stamp.format(dueAt)}.`;
  }
  return REFUND_CUSTOMER_COPY[status];
}

/**
 * Complaints the buyer already filed on one order, newest first.
 *
 * Only ever scoped by order token. Complaints about a book from someone without an
 * order are readable through their own ticket link, never from the book page — one
 * buyer's complaint is not content for the next.
 */
export async function complaintViews(where: { orderId: string }): Promise<ComplaintView[]> {
  const complaints = await prisma.complaint.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: 20,
  });

  return complaints.map((complaint) => ({
    id: complaint.id,
    subject: complaint.subject,
    body: complaint.body,
    statusLabel: COMPLAINT_STATUS_LABELS[complaint.status as ComplaintStatus],
    createdAtLabel: stamp.format(complaint.createdAt),
    reply: complaint.reply,
    answeredLabel: complaint.answeredAt ? stamp.format(complaint.answeredAt) : null,
  }));
}

/**
 * The refund queue for one storefront. The books dashboard and the cafe staff area
 * never see each other's money, and `decideRefundAction` re-checks that claim.
 */
export async function listRefundQueue(channel: 'BOOKS' | 'CAFE', limit = 80): Promise<RefundQueueRow[]> {
  const refunds = await prisma.refundRequest.findMany({
    where: { order: { channel } },
    orderBy: [{ status: 'asc' }, { reviewDueAt: 'asc' }],
    take: limit,
    include: {
      order: {
        select: {
          id: true,
          orderId: true,
          token: true,
          channel: true,
          customer: { select: { label: true } },
        },
      },
      reviewedBy: { select: { name: true } },
    },
  });

  const now = Date.now();
  return refunds.map((refund) => ({
    id: refund.id,
    orderId: refund.orderId,
    orderCode: refund.order.orderId,
    orderToken: refund.order.token,
    channel: refund.order.channel,
    customerLabel: refund.order.customer.label,
    amountLabel: formatINR(refund.amountInPaise),
    reason: refund.reason,
    payoutVpa: refund.payoutVpa,
    status: refund.status as RefundStatus,
    decisionLabel: REFUND_STATUS_LABELS[refund.status as RefundStatus],
    requestedLabel: stamp.format(refund.requestedAt),
    dueLabel: stamp.format(refund.reviewDueAt),
    overdue: refund.status === 'REQUESTED' || refund.status === 'APPROVED'
      ? refund.reviewDueAt.getTime() < now
      : false,
    decisionNote: refund.decisionNote,
    payoutReference: refund.payoutReference,
    reviewedByName: refund.reviewedBy?.name ?? null,
  }));
}

/**
 * The complaint inbox for one storefront. Messages with no order attached at all
 * appear in both queues — a buyer who complained from a book page and a buyer who
 * complained about a coffee both deserve an answer, and nobody should have to
 * guess which staff area they landed in.
 */
export async function listComplaintInbox(channel: 'BOOKS' | 'CAFE', limit = 100): Promise<ComplaintInboxRow[]> {
  const complaints = await prisma.complaint.findMany({
    where: {
      OR: [{ order: { channel } }, { orderId: null }],
    },
    orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
    take: limit,
    include: {
      order: { select: { orderId: true, token: true } },
      book: { select: { title: true } },
      answeredBy: { select: { name: true } },
    },
  });

  const now = Date.now();
  return complaints.map((complaint) => ({
    id: complaint.id,
    subject: complaint.subject,
    body: complaint.body,
    fromName: complaint.fromName,
    contact: complaint.contact,
    source: complaint.source,
    status: complaint.status as ComplaintStatus,
    statusLabel: COMPLAINT_STATUS_LABELS[complaint.status as ComplaintStatus],
    createdAtLabel: stamp.format(complaint.createdAt),
    orderCode: complaint.order?.orderId ?? null,
    orderToken: complaint.order?.token ?? null,
    bookTitle: complaint.book?.title ?? null,
    reply: complaint.reply,
    answeredLabel: complaint.answeredAt ? stamp.format(complaint.answeredAt) : null,
    answeredByName: complaint.answeredBy?.name ?? null,
    viewToken: complaint.viewToken,
    overdue: complaint.status === 'OPEN' && reviewDeadlineAt(complaint.createdAt).getTime() < now,
  }));
}

export type ComplaintStatusPage = {
  reference: string;
  subject: string;
  body: string;
  fromName: string;
  status: ComplaintStatus;
  statusLabel: string;
  createdAtLabel: string;
  reply: string | null;
  answeredLabel: string | null;
  /** Order code if the complaint is tied to one; never the token. */
  orderCode: string | null;
  bookTitle: string | null;
};

/** The public "where is my complaint" page, addressed by its random token. */
export async function complaintByViewToken(viewToken: string): Promise<ComplaintStatusPage | null> {
  const complaint = await prisma.complaint.findUnique({
    where: { viewToken },
    include: { order: { select: { orderId: true } }, book: { select: { title: true } } },
  });
  if (!complaint) return null;

  return {
    reference: complaint.viewToken ?? '',
    subject: complaint.subject,
    body: complaint.body,
    fromName: complaint.fromName,
    status: complaint.status as ComplaintStatus,
    statusLabel: COMPLAINT_STATUS_LABELS[complaint.status as ComplaintStatus],
    createdAtLabel: dayStamp.format(complaint.createdAt),
    reply: complaint.reply,
    answeredLabel: complaint.answeredAt ? stamp.format(complaint.answeredAt) : null,
    orderCode: complaint.order?.orderId ?? null,
    bookTitle: complaint.book?.title ?? null,
  };
}

/** A submitted title waiting for an admin's decision. */
export type BookReviewRow = {
  id: string;
  title: string;
  author: string;
  slug: string;
  blurb: string;
  priceLabel: string;
  format: string;
  pages: number | null;
  filePath: string | null;
  fileStatus: 'none' | 'ok' | 'outside';
  coverUrl: string | null;
  submittedLabel: string;
  published: boolean;
  reviewNote: string | null;
};

/**
 * The review queue: everything a staffer submitted and an admin has not decided.
 *
 * A title sits here unpublished, so the storefront never shows a book whose cover,
 * file or price nobody has checked.
 */
export async function listBookReviewQueue(limit = 50): Promise<BookReviewRow[]> {
  const books = await prisma.book.findMany({
    where: { submittedAt: { not: null } },
    orderBy: { submittedAt: 'asc' },
    take: limit,
  });

  return books.map((book) => ({
    id: book.id,
    title: book.title,
    author: book.author,
    slug: book.slug,
    blurb: book.blurb,
    priceLabel: formatINR(book.priceInPaise),
    format: book.format,
    pages: book.pages,
    filePath: book.filePath,
    fileStatus: fileStatusFor(book.filePath),
    coverUrl: coverUrlFor(book.coverPath),
    submittedLabel: book.submittedAt ? stamp.format(book.submittedAt) : '—',
    published: book.published,
    reviewNote: book.reviewNote,
  }));
}

/** How many cases still need a decision, and how many broke their own deadline. */
export function countPendingCases(rows: { status: string; overdue?: boolean }[]): {
  pending: number;
  overdue: number;
} {
  const waiting = rows.filter((row) => row.status === 'REQUESTED' || row.status === 'OPEN');
  return { pending: waiting.length, overdue: waiting.filter((row) => row.overdue).length };
}
