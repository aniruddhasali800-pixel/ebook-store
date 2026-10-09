'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/db';
import { PaymentServiceError, transitionPayment } from '@/lib/payments/service';
import { rupeesToPaise } from '@/lib/money';
import { extendSession, requireAdmin, requireStaff } from '@/lib/auth/session';
import { publishActivity } from '@/lib/activity';
import { saveBookFileUpload, saveCoverUpload } from '@/lib/uploads';
import { storedObjectFor } from '@/lib/storage-path';
import type { PaymentStatus } from '@/lib/payments/status';
import type { StaffFormState } from '@/lib/actions/staff';

const DECISIONS: Record<string, PaymentStatus> = {
  paid: 'PAID',
  failed: 'FAILED',
  cancelled: 'CANCELLED',
};

/**
 * Settle an ebook order from the shop dashboard.
 *
 * Deliberately narrower than verifyPaymentAction: it will only touch orders on
 * the BOOKS channel, so the password-free dashboard cannot reach cafe orders, the
 * kitchen, or the payee UPI ID. The state machine is unchanged — PAID still
 * requires a bank reference, and a customer claim still cannot settle anything.
 */
export async function verifyBookPaymentAction(
  _state: StaffFormState,
  formData: FormData,
): Promise<StaffFormState> {
  // This action is the only thing that may stamp a book order as paid, so it
  // cannot trust the caller's claim of who they are: an unauthenticated POST
  // would otherwise reach `actor: 'STAFF'` below and settle money nobody checked.
  let staff;
  try {
    staff = await requireStaff();
  } catch {
    return { ok: false, message: 'Your session has expired. Sign in again.' };
  }
  await extendSession(staff);

  const orderId = String(formData.get('orderId') ?? '');
  const to = DECISIONS[String(formData.get('decision') ?? '')];
  const reference = String(formData.get('reference') ?? '').trim();
  const reason = String(formData.get('reason') ?? '').trim();

  if (!orderId || !to) return { ok: false, message: 'Choose an outcome for this payment.' };

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: { channel: true },
  });
  if (!order || order.channel !== 'BOOKS') {
    return { ok: false, message: 'That order is not part of the book shop.' };
  }

  try {
    await transitionPayment({
      orderId,
      to,
      actor: 'STAFF',
      reference: reference || undefined,
      reason: reason || undefined,
    });
  } catch (error) {
    if (error instanceof PaymentServiceError) return { ok: false, message: error.message };
    if (error instanceof Error && error.name === 'PaymentTransitionError') {
      return { ok: false, message: error.message };
    }
    console.error('Book payment verification failed', error);
    return { ok: false, message: 'Could not update this payment. Try again.' };
  }

  revalidatePath('/dashboard');
  return {
    ok: true,
    message:
      to === 'PAID'
        ? 'Marked paid. The buyer’s download link is live.'
        : `Payment marked ${to.toLowerCase()}.`,
  };
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 72);
}

function readBookForm(formData: FormData) {
  const title = String(formData.get('title') ?? '').trim();
  const price = rupeesToPaise(String(formData.get('price') ?? ''));
  const listRaw = String(formData.get('listPrice') ?? '').trim();
  const listPrice = listRaw ? rupeesToPaise(listRaw) : null;
  const pagesRaw = String(formData.get('pages') ?? '').trim();
  const filePath = String(formData.get('filePath') ?? '').trim();

  return {
    title,
    slug: slugify(String(formData.get('slug') ?? '') || title),
    subtitle: String(formData.get('subtitle') ?? '').trim().slice(0, 140),
    author: String(formData.get('author') ?? '').trim().slice(0, 80),
    category: String(formData.get('category') ?? '').trim().slice(0, 40) || 'AI',
    blurb: String(formData.get('blurb') ?? '').trim().slice(0, 1200),
    priceInPaise: price,
    listPriceInPaise: listRaw ? listPrice : null,
    pages: pagesRaw ? Number(pagesRaw) : null,
    format: String(formData.get('format') ?? '').trim().slice(0, 40) || 'PDF',
    filePath: filePath || null,
    published: formData.get('published') === 'on',
    coverFile: formData.get('cover') instanceof File ? (formData.get('cover') as File) : null,
    bookFile: formData.get('bookFile') instanceof File ? (formData.get('bookFile') as File) : null,
  };
}

export type BookFormState = { ok: boolean; message?: string; bookId?: string } | undefined;

/**
 * Creates a new title, or updates the one carried in the hidden `id` field.
 *
 * A new title always lands in the review queue rather than on the storefront:
 * the person filling this form is not necessarily the person who decides what
 * the shop sells, and a book that went live the moment it was typed would put
 * unreviewed covers and prices in front of paying customers.
 */
export async function saveBookAction(
  _state: BookFormState,
  formData: FormData,
): Promise<BookFormState> {
  let staff;
  try {
    staff = await requireStaff();
  } catch {
    return { ok: false, message: 'Sign in before editing the catalogue.' };
  }
  await extendSession(staff);

  const id = String(formData.get('id') ?? '');
  const book = readBookForm(formData);

  if (book.title.length < 3) return { ok: false, message: 'A title needs a name of at least 3 characters.' };
  if (!book.slug) return { ok: false, message: 'That name cannot be turned into a web address. Give it a slug.' };
  if (book.priceInPaise === null || book.priceInPaise <= 0) {
    return { ok: false, message: 'Price must be a rupee amount above zero, like 399 or 399.50.' };
  }
  if (book.listPriceInPaise === null && String(formData.get('listPrice') ?? '').trim()) {
    return { ok: false, message: 'The “before” price is not a valid amount.' };
  }
  if (book.pages !== null && (!Number.isInteger(book.pages) || book.pages <= 0 || book.pages > 9999)) {
    return { ok: false, message: 'Pages must be a whole number between 1 and 9999.' };
  }
  if (book.filePath && !storedObjectFor(book.filePath)) {
    return { ok: false, message: 'That file address is not one this shop stored. Attach the PDF instead.' };
  }

  const clash = await prisma.book.findUnique({ where: { slug: book.slug }, select: { id: true } });
  if (clash && clash.id !== id) return { ok: false, message: `Another title already uses /books/${book.slug}.` };

  const slugForFiles = book.slug;

  // Uploads overwrite nothing and fail the whole save if they are rejected, so a
  // half-attached title never reaches the queue.
  let coverPath: string | null = null;
  if (book.coverFile?.size) {
    const uploaded = await saveCoverUpload(book.coverFile, slugForFiles);
    if ('error' in uploaded) return { ok: false, message: uploaded.error };
    coverPath = uploaded.filePath;
  }
  let uploadedFile: string | null = null;
  if (book.bookFile?.size) {
    const uploaded = await saveBookFileUpload(book.bookFile, slugForFiles);
    if ('error' in uploaded) return { ok: false, message: uploaded.error };
    uploadedFile = uploaded.filePath;
  }

  const existing = id
    ? await prisma.book.findUnique({ where: { id }, select: { coverPath: true, filePath: true } })
    : null;
  if (!coverPath && existing?.coverPath) coverPath = existing.coverPath;
  const filePath = uploadedFile ?? book.filePath ?? existing?.filePath ?? null;

  const data = {
    slug: book.slug,
    title: book.title,
    subtitle: book.subtitle || null,
    author: book.author || 'Unattributed',
    category: book.category,
    blurb: book.blurb,
    priceInPaise: book.priceInPaise,
    listPriceInPaise: book.listPriceInPaise,
    pages: book.pages,
    format: book.format,
    filePath,
    coverPath,
    published: id ? book.published : false,
  };

  try {
    const saved = id
      ? await prisma.book.update({ where: { id }, data })
      : await prisma.book.create({
          data: {
            ...data,
            published: false,
            submittedAt: new Date(),
            sortOrder: (await prisma.book.count()) + 1,
          },
        });

    if (!id) {
      await publishActivity({
        type: 'book',
        channel: 'BOOKS',
        headline: `New title submitted: ${book.title}`,
        detail: `₹${(book.priceInPaise / 100).toFixed(2)} — waiting for review`,
        href: '/dashboard/review',
      });
    }

    revalidatePath('/');
    revalidatePath('/dashboard');
    revalidatePath('/dashboard/review');
    return {
      ok: true,
      bookId: saved.id,
      message: id
        ? 'Title updated.'
        : 'Saved. It is in the review queue now — publish it from there when you have checked the cover, the file and the price.',
    };
  } catch (error) {
    console.error('Book save failed', error);
    return { ok: false, message: 'Could not save that title.' };
  }
}

/**
 * The review decision. Publishing is an ADMIN act; a cashier can read the queue
 * but cannot put a book on sale.
 */
export async function reviewBookAction(
  _state: BookFormState,
  formData: FormData,
): Promise<BookFormState> {
  let admin;
  try {
    admin = await requireAdmin();
  } catch {
    return { ok: false, message: 'Only an admin can publish or reject a submitted title.' };
  }
  await extendSession(admin);

  const bookId = String(formData.get('bookId') ?? '');
  const decision = String(formData.get('decision') ?? '');
  const note = String(formData.get('reviewNote') ?? '').trim().slice(0, 600);

  if (!bookId || (decision !== 'publish' && decision !== 'reject')) {
    return { ok: false, message: 'Choose publish or reject for this title.' };
  }
  const book = await prisma.book.findUnique({
    where: { id: bookId },
    select: { id: true, title: true, published: true, submittedAt: true, filePath: true },
  });
  if (!book) return { ok: false, message: 'That title no longer exists.' };
  if (decision === 'publish' && !book.filePath) {
    return { ok: false, message: 'Nothing could be delivered yet — this title has no PDF attached. Add the file first.' };
  }

  await prisma.book.update({
    where: { id: bookId },
    data: {
      published: decision === 'publish',
      submittedAt: null,
      reviewedAt: new Date(),
      reviewedById: admin.id,
      reviewNote: note || (decision === 'publish' ? 'Published from the review queue.' : null),
    },
  });

  await publishActivity({
    type: 'book',
    channel: 'BOOKS',
    headline: decision === 'publish' ? `Published: ${book.title}` : `Rejected: ${book.title}`,
    detail: note || undefined,
    href: '/dashboard/review',
  });

  revalidatePath('/');
  revalidatePath('/dashboard/review');
  revalidatePath('/dashboard');
  return { ok: true, message: decision === 'publish' ? 'On sale now.' : 'Sent back with your note.' };
}
