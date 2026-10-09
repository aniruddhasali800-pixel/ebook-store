'use server';

import { randomBytes } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/db';
import { extendSession, requireStaff } from '@/lib/auth/session';
import { CaseStateMachineError, moveComplaint, type ComplaintStatus } from '@/lib/case-log';
import { publishActivity } from '@/lib/activity';
import type { StaffFormState } from '@/lib/actions/staff';

/** Adds the ticket link to the shared staff form state. */
export type ComplaintFormState = {
  ok: boolean;
  message?: string;
  href?: string;
  linkLabel?: string;
} | undefined;

const DECISIONS: Record<string, ComplaintStatus> = {
  answer: 'ANSWERED',
  close: 'CLOSED',
};

/**
 * A complaint straight to the shop: about a book, an order, a refund decision, or
 * anything else on the site. Anyone with a receipt link can use it, which is the
 * point — a buyer who cannot reach the shop has no reason to stay honest about it.
 *
 * There is no login and no captcha here. If this ever draws spam, put it behind
 * the host's rate limiting rather than making a complaining customer prove
 * something first.
 */
export async function fileComplaintAction(
  _state: ComplaintFormState,
  formData: FormData,
): Promise<ComplaintFormState> {
  // Hidden field only a bot filling every input would complete.
  if (String(formData.get('website') ?? '').trim()) {
    return { ok: true, message: 'Received.' };
  }

  const fromName = String(formData.get('fromName') ?? '').trim().slice(0, 60);
  const contact = String(formData.get('contact') ?? '').trim().slice(0, 80);
  const subject = String(formData.get('subject') ?? '').trim().slice(0, 120);
  const body = String(formData.get('body') ?? '').trim();
  const token = String(formData.get('token') ?? '').trim();
  const bookId = String(formData.get('bookId') ?? '').trim();

  if (fromName.length < 2) return { ok: false, message: 'Leave a name the shop can address you by.' };
  if (subject.length < 4) return { ok: false, message: 'Give the complaint a short subject.' };
  if (body.length < 20) return { ok: false, message: 'Describe what went wrong — at least a couple of sentences.' };
  if (!contact && !token) {
    return { ok: false, message: 'Add a way to reach you, or send it from your order page so it carries the order.' };
  }

  const order = token
    ? await prisma.order.findUnique({ where: { token }, select: { id: true, orderId: true, token: true, channel: true } })
    : null;
  if (token && !order) return { ok: false, message: 'That order could not be found. Send it without the order number instead.' };

  const book = bookId
    ? await prisma.book.findUnique({ where: { id: bookId }, select: { id: true, slug: true, title: true } })
    : null;

  // Every complaint gets a status link. A buyer who complained from a book page has
  // no receipt to return to, and "we will get back to you" with no way to check is
  // not an answer.
  const viewToken = randomBytes(9).toString('hex');

  await prisma.complaint.create({
    data: {
      fromName,
      contact: contact || null,
      subject,
      body: body.slice(0, 4000),
      source: order ? 'receipt' : book ? 'book' : 'site',
      orderId: order?.id ?? null,
      bookId: book?.id ?? null,
      viewToken,
    },
  });

  await publishActivity({
    type: 'complaint',
    // Anything that is not a cafe order is answered in the book shop inbox, which
    // is where the chime has to be heard.
    channel: order?.channel ?? 'BOOKS',
    headline: `Complaint: ${subject.slice(0, 70)}`,
    detail: `${fromName}${order ? ` · order #${order.orderId}` : ''}`,
    href: order?.channel === 'CAFE' ? '/admin/complaints' : '/dashboard/complaints',
  });

  revalidatePath('/dashboard/complaints');
  revalidatePath('/admin/complaints');
  if (order) revalidatePath(`/pay/${order.token}`);

  return {
    ok: true,
    message: order
      ? 'Sent. The shop sees it in their complaint inbox, and the answer appears on this page once they write one.'
      : 'Sent. The shop sees it in their complaint inbox.',
    href: `/complaint/${viewToken}`,
    linkLabel: 'Track this complaint',
  };
}

/** Staff answer or close. A complaint that was never answered cannot be closed quietly. */
export async function decideComplaintAction(
  _state: StaffFormState,
  formData: FormData,
): Promise<StaffFormState> {
  let staff;
  try {
    staff = await requireStaff();
  } catch {
    return { ok: false, message: 'Your session has expired. Sign in again.' };
  }
  await extendSession(staff);

  const complaintId = String(formData.get('complaintId') ?? '');
  const to = DECISIONS[String(formData.get('decision') ?? '')];
  const reply = String(formData.get('reply') ?? '').trim();

  if (!complaintId || !to) return { ok: false, message: 'Choose what to do with this complaint.' };
  if (to === 'ANSWERED' && reply.length < 10) {
    return { ok: false, message: 'Write the answer you want the customer to see before marking it answered.' };
  }

  const complaint = await prisma.complaint.findUnique({
    where: { id: complaintId },
    select: { id: true, status: true, order: { select: { token: true } } },
  });
  if (!complaint) return { ok: false, message: 'That complaint no longer exists.' };

  try {
    await moveComplaint({
      complaintId,
      to,
      actor: 'STAFF',
      staffId: staff.id,
      reply: reply || undefined,
    });
  } catch (error) {
    if (error instanceof CaseStateMachineError) return { ok: false, message: error.message };
    console.error('Complaint decision failed', error);
    return { ok: false, message: 'Could not update that complaint.' };
  }

  revalidatePath('/dashboard/complaints');
  if (complaint.order?.token) revalidatePath(`/pay/${complaint.order.token}`);

  return {
    ok: true,
    message: to === 'ANSWERED' ? 'Answered. The customer sees your reply on their order page.' : 'Closed.',
  };
}
