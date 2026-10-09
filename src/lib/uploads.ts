import 'server-only';
import { randomBytes } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

/**
 * Uploading a cover or a book file from the dashboard.
 *
 * Two rules, both boring on purpose: the bytes land under `storage/` only, and
 * the filename is generated rather than taken from whatever the browser called
 * it. `src/lib/books.ts:insideStorage` is what keeps the stored path from
 * escaping that directory later, so anything written here has to be a path that
 * guard already accepts.
 */

const MAX_COVER_BYTES = 3 * 1024 * 1024;
const MAX_PDF_BYTES = 30 * 1024 * 1024;

const COVER_TYPES: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
};

export type UploadResult = { filePath: string } | { error: string };

function safeStem(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || 'book';
}

async function writeUnder(folder: 'covers' | 'books', stem: string, bytes: ArrayBuffer, extension: string): Promise<UploadResult> {
  const directory = path.join(process.cwd(), 'storage', folder);
  await mkdir(directory, { recursive: true });
  // A generated name means an upload can never overwrite a neighbour's file,
  // and the extension comes from our own table, never from the client.
  const fileName = `${stem}-${randomBytes(6).toString('hex')}.${extension}`;
  const target = path.join(directory, fileName);
  await writeFile(target, Buffer.from(bytes));
  return { filePath: `storage/${folder}/${fileName}` };
}

export async function saveCoverUpload(file: File | null, slug: string): Promise<UploadResult> {
  if (!file || file.size === 0) return { error: 'Choose an image file for the cover.' };
  const extension = COVER_TYPES[file.type];
  if (!extension) return { error: 'Covers must be a PNG, JPEG or WebP image.' };
  if (file.size > MAX_COVER_BYTES) return { error: 'That cover is over 3 MB. Export a smaller one.' };
  return writeUnder('covers', safeStem(slug), await file.arrayBuffer(), extension);
}

export async function saveBookFileUpload(file: File | null, slug: string): Promise<UploadResult> {
  if (!file || file.size === 0) return { error: 'Choose the book file to attach.' };
  if (file.type !== 'application/pdf') return { error: 'Book files have to be PDFs.' };
  if (file.size > MAX_PDF_BYTES) return { error: 'That PDF is over 30 MB.' };
  return writeUnder('books', safeStem(slug), await file.arrayBuffer(), 'pdf');
}
