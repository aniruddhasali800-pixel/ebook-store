import 'server-only';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import path from 'node:path';
import { prisma } from '@/lib/db';
import { publishActivity } from '@/lib/activity';
import { formatINR } from '@/lib/money';
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

  publishActivity({
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
 * The tail of a stored path once its leading `storage/` is removed, or null when
 * the path is not inside it. `.` and `..` segments are rejected, so joining the
 * result back onto `storage/` can never resolve above it.
 */
function insideStorage(filePath: string | null): string | null {
  if (!filePath) return null;
  const relative = filePath.replaceAll('\\', '/').replace(/^storage\/+/, '');
  if (relative === '' || relative.startsWith('/')) return null;
  const climbs = relative.split('/').some((part) => part === '..' || part === '.');
  return climbs ? null : relative;
}

/** Where a title's file stands, so the dashboard can warn before someone pays. */
export function fileStatusFor(filePath: string | null): 'none' | 'ok' | 'missing' | 'outside' {
  if (!filePath) return 'none';
  const relative = insideStorage(filePath);
  if (relative === null) return 'outside';
  return existsSync(path.join(process.cwd(), 'storage', relative)) ? 'ok' : 'missing';
}

const COVER_CONTENT_TYPES: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
};

/**
 * Public URL for an uploaded cover, or null when the path is not a cover inside
 * `storage/covers/`.
 *
 * A cover is storefront artwork, so it is served without a paid order — unlike a
 * book file. It still goes through the same path guard, because the database column
 * is editable text and a bad path should not turn this route into a file reader.
 */
export function coverUrlFor(coverPath: string | null): string | null {
  const relative = insideStorage(coverPath);
  if (!relative || !relative.startsWith('covers/')) return null;
  const extension = relative.split('.').pop()?.toLowerCase() ?? '';
  if (!COVER_CONTENT_TYPES[extension]) return null;
  return `/api/covers/${relative.slice('covers/'.length)}`;
}

/** Cover bytes addressed from `coverUrlFor`, or null for anything suspicious. */
export async function readCoverBytes(tail: string): Promise<{ bytes: Buffer; contentType: string } | null> {
  if (!tail || tail.split('/').some((part) => part === '' || part === '.' || part === '..')) return null;
  const relative = insideStorage(`storage/covers/${tail}`);
  if (!relative || !relative.startsWith('covers/')) return null;

  const extension = relative.split('.').pop()?.toLowerCase() ?? '';
  const contentType = COVER_CONTENT_TYPES[extension];
  if (!contentType) return null;

  try {
    return { bytes: await readFile(path.join(process.cwd(), 'storage', relative)), contentType };
  } catch {
    return null;
  }
}

export type OrderDownload = {
  bookId: string;
  title: string;
  format: string;
  fileName: string;
  /** The catalogue's stored path; re-validated by `readBookFile` before any read. */
  filePath: string;
};

/**
 * Titles a settled ebook order may release.
 *
 * The caller must have already checked paymentStatus === 'PAID'; this only
 * resolves the stored paths and drops any title whose file is missing or sits
 * outside the storage directory.
 */
export async function listOrderDownloads(orderId: string): Promise<OrderDownload[]> {
  const items = await prisma.orderItem.findMany({
    where: { orderId, book: { isNot: null } },
    include: { book: true },
  });

  return items.flatMap((item) => {
    const book = item.book;
    if (!book?.filePath) return [];
    const relative = insideStorage(book.filePath);
    if (relative === null) return [];
    if (!existsSync(path.join(process.cwd(), 'storage', relative))) return [];
    return [
      {
        bookId: book.id,
        title: book.title,
        format: book.format,
        fileName: relative.split('/').pop()!,
        filePath: book.filePath,
      },
    ];
  });
}

/**
 * Bytes behind one download entry, or null when the file is gone. Re-checks the
 * path rather than trusting the caller to have come through `listOrderDownloads`.
 */
export async function readBookFile(filePath: string): Promise<Buffer | null> {
  const relative = insideStorage(filePath);
  if (relative === null) return null;
  try {
    return await readFile(path.join(process.cwd(), 'storage', relative));
  } catch {
    return null;
  }
}
