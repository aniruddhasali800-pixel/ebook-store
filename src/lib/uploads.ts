import 'server-only';
import { randomBytes } from 'node:crypto';
import { putStorageFile, StorageError } from '@/lib/storage';
import type { StorageFolder } from '@/lib/storage-path';

/**
 * Uploading a cover or a book file from the dashboard.
 *
 * Two rules, both boring on purpose: the bytes go to object storage under
 * `storage/covers/` or `storage/books/` only, and the name is generated rather
 * than taken from whatever the browser called it. `src/lib/storage-path.ts` is
 * what keeps the stored address from being read back as something else later, so
 * anything written here has to be an address that guard already accepts.
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

async function store(
  folder: StorageFolder,
  stem: string,
  extension: string,
  contentType: string,
  bytes: ArrayBuffer,
): Promise<UploadResult> {
  // A random suffix means an upload can never overwrite a neighbour's file, and
  // the extension comes from our own table, never from the client.
  const fileName = `${stem}-${randomBytes(6).toString('hex')}.${extension}`;
  try {
    return { filePath: await putStorageFile(folder, fileName, bytes, contentType) };
  } catch (error) {
    if (error instanceof StorageError) return { error: error.message };
    return { error: 'The file store refused that upload. Try again, or attach a smaller file.' };
  }
}

export async function saveCoverUpload(file: File | null, slug: string): Promise<UploadResult> {
  if (!file || file.size === 0) return { error: 'Choose an image file for the cover.' };
  const extension = COVER_TYPES[file.type];
  if (!extension) return { error: 'Covers must be a PNG, JPEG or WebP image.' };
  if (file.size > MAX_COVER_BYTES) return { error: 'That cover is over 3 MB. Export a smaller one.' };
  return store('covers', safeStem(slug), extension, file.type, await file.arrayBuffer());
}

export async function saveBookFileUpload(file: File | null, slug: string): Promise<UploadResult> {
  if (!file || file.size === 0) return { error: 'Choose the book file to attach.' };
  if (file.type !== 'application/pdf') return { error: 'Book files have to be PDFs.' };
  if (file.size > MAX_PDF_BYTES) return { error: 'That PDF is over 30 MB.' };
  return store('books', safeStem(slug), 'pdf', 'application/pdf', await file.arrayBuffer());
}
