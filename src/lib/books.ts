import 'server-only';
import { randomBytes } from 'node:crypto';
import { prisma } from '@/lib/db';
import { publishActivity } from '@/lib/activity';
import { formatINR } from '@/lib/money';
import { storedObjectFor } from '@/lib/storage-path';
import { readStoredFile } from '@/lib/storage';
import { loadPayeeTarget, PaymentSettingsError } from '@/lib/settings';
import { getPaymentProvider, resolvePaymentProviderId } from '@/lib/payments/registry';
import { generateOrderCode, OrderCreationError, type CreatedOrder } from '@/lib/orders';
import type { PaymentIntent } from '@/lib/payments/types';

export async function listPublishedBooks() {
  return prisma.book.findMany({
    where: { published: true },
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
  });
}

/** Everything, published or not — the shop dashboard's view of the catalogue. */
export async function listAllBooks() {
  return prisma.book.findMany({
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
  });
}

export async function findBookBySlug(slug: string) {
  return prisma.book.findFirst({ where: { slug, published: true } });
}

/**
 * One ebook per order.
 *
 * Same money path as a cafe order — the payee VPA is frozen onto the row and the
 * amount comes from the catalogue, never from the request — but the order is
 * tagged channel: 'BOOKS' so settlement unlocks a download instead of the kitchen.
 */
export async function createBookOrder(input: {
  bookId: string;
  buyerLabel?: string;
  paymentMethod?: unknown;
}): Promise<CreatedOrder & { intent: PaymentIntent; bookTitle: string }> {
  const book = await prisma.book.findUnique({ where: { id: input.bookId } });
  if (!book || !book.published) {
    throw new OrderCreationError('That title is no longer on sale.');
  }

  const payee = await loadPayeeTarget().catch((error: unknown) => {
    if (error instanceof PaymentSettingsError) throw new OrderCreationError(error.message);
    throw error;
  });

  const orderId = await generateOrderCode();
  const token = randomBytes(16).toString('base64url');
  const buyerLabel = (input.buyerLabel ?? '').trim().slice(0, 60) || 'Book buyer';
  const paymentMethod = resolvePaymentProviderId(input.paymentMethod);

  const order = await prisma.order.create({
    data: {
      orderId,
      token,
      channel: 'BOOKS',
      paymentMethod,
      paymentStatus: 'PENDING',
      status: 'AWAITING_PAYMENT',
      upiIdUsed: payee.vpa,
      currency: 'INR',
      subtotalInPaise: book.priceInPaise,
      totalInPaise: book.priceInPaise,
      customer: { create: { label: buyerLabel } },
      items: {
        create: [
          {
            bookId: book.id,
            name: book.title,
            unitPriceInPaise: book.priceInPaise,
            quantity: 1,
            lineTotalInPaise: book.priceInPaise,
          },
        ],
      },
    },
    select: { id: true, orderId: true, token: true, totalInPaise: true },
  });

  await publishActivity({
    type: 'order',
    channel: 'BOOKS',
    headline: `New book order #${orderId}`,
    detail: `${formatINR(book.priceInPaise)} — ${book.title}`,
    href: `/pay/${token}`,
  });

  const intent = await getPaymentProvider(paymentMethod).createIntent({
    orderCode: orderId,
    orderToken: token,
    amountInPaise: book.priceInPaise,
    currency: 'INR',
    payee: { vpa: payee.vpa, name: payee.payeeName },
    noteText: `${book.title} #${orderId}`,
  });

  return { ...order, intent, bookTitle: book.title };
}

/**
 * Where a title's file stands, so the dashboard can warn before someone pays.
 *
 * A stored address is checked against the storage rules, not against the network:
 * asking object storage whether a file exists would put a request per title on
 * every dashboard page load. A file that has since disappeared is found when the
 * buyer tries to download it, and the download route says so plainly.
 */
export function fileStatusFor(filePath: string | null): 'none' | 'ok' | 'outside' {
  if (!filePath) return 'none';
  const object = storedObjectFor(filePath);
  return object && object.folder === 'books' ? 'ok' : 'outside';
}

const COVER_CONTENT_TYPES: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
};

/**
 * Direct URL for an uploaded cover, or null when the path is not a cover the shop
 * stored itself.
 *
 * A cover is storefront artwork, so it is public — unlike a book file, which only
 * ever leaves through the paywalled download route. The address still goes through
 * the same validator, because the database column is editable text and a bad value
 * should not turn the storefront into a proxy for somebody else's server.
 */
export function coverUrlFor(coverPath: string | null): string | null {
  const object = storedObjectFor(coverPath);
  if (!object || object.folder !== 'covers') return null;
  const extension = object.fileName.split('.').pop()?.toLowerCase() ?? '';
  return COVER_CONTENT_TYPES[extension] ? object.url : null;
}

export type OrderDownload = {
  bookId: string;
  title: string;
  format: string;
  fileName: string;
  /** The stored address; re-validated by `readBookFile` before any read. */
  filePath: string;
};

/**
 * Titles a settled ebook order may release.
 *
 * The caller must have already checked paymentStatus === 'PAID'; this only
 * resolves the stored addresses and drops any title whose file is missing or is
 * not an address this app would have written.
 */
export async function listOrderDownloads(orderId: string): Promise<OrderDownload[]> {
  const items = await prisma.orderItem.findMany({
    where: { orderId, book: { isNot: null } },
    include: { book: true },
  });

  return items.flatMap((item) => {
    const book = item.book;
    if (!book?.filePath) return [];
    const object = storedObjectFor(book.filePath);
    if (!object || object.folder !== 'books') return [];
    return [
      {
        bookId: book.id,
        title: book.title,
        format: book.format,
        fileName: object.fileName,
        filePath: book.filePath,
      },
    ];
  });
}

/**
 * Bytes behind one download entry, or null when the file is gone. Re-checks the
 * address rather than trusting the caller to have come through `listOrderDownloads`.
 */
export async function readBookFile(filePath: string): Promise<Buffer | null> {
  return readStoredFile(filePath);
}
