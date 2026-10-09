import { readCoverBytes } from '@/lib/books';

export const dynamic = 'force-dynamic';

/**
 * Serves the covers the shop uploads, from `storage/covers/` only.
 *
 * Files under `storage/` are not public assets, so this is the single door for
 * cover images. `readCoverBytes` rejects path traversal and extensions outside the
 * image table, which is why this handler can trust what it streams.
 */
export async function GET(
  _request: Request,
  context: { params: Promise<{ path: string[] }> },
) {
  const { path } = await context.params;
  const cover = await readCoverBytes(path.join('/'));
  if (!cover) return new Response('Not found', { status: 404 });

  return new Response(new Uint8Array(cover.bytes), {
    headers: {
      'content-type': cover.contentType,
      // Generated names carry a random suffix, so a URL never changes contents.
      'cache-control': 'public, max-age=31536000, immutable',
    },
  });
}
