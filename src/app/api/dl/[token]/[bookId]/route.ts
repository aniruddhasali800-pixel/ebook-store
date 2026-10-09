import { connection } from 'next/server';
import { listOrderDownloads, readBookFile } from '@/lib/books';
import { findOrderByToken } from '@/lib/orders';

/**
 * Releases one ebook file for one settled order.
 *
 * The unguessable order token is the receipt, and PAID is the only thing that
 * unlocks it — a pending or self-claimed order gets a 403 even though the link
 * is already visible on its payment page.
 */
export async function GET(
  _request: Request,
  context: { params: Promise<{ token: string; bookId: string }> },
) {
  await connection();
  const { token, bookId } = await context.params;

  const order = await findOrderByToken(token);
  if (!order || order.channel !== 'BOOKS') return new Response('Not found', { status: 404 });
  if (order.paymentStatus !== 'PAID') {
    return new Response('Payment is not confirmed yet.', { status: 403 });
  }

  const file = (await listOrderDownloads(order.id)).find((item) => item.bookId === bookId);
  if (!file) return new Response('Not found', { status: 404 });

  const bytes = await readBookFile(file.filePath);
  if (!bytes) return new Response('Not found', { status: 404 });
  return new Response(new Uint8Array(bytes), {
    headers: {
      'content-type': 'application/pdf',
      'content-length': String(bytes.byteLength),
      'content-disposition': `attachment; filename="${file.fileName.replace(/["\r\n]/g, '')}"`,
      'cache-control': 'no-store',
    },
  });
}
