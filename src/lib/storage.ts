import { put } from '@vercel/blob';
import { storageKeyFor, storedObjectFor, type StorageFolder } from '@/lib/storage-path';

/**
 * Writing and reading the shop's files: ebook PDFs and uploaded cover images.
 *
 * This is deliberately the only module that talks to object storage. Nothing
 * here is marked `server-only`, because `prisma/seed.ts` runs from a terminal
 * and has to write the same way the dashboard does.
 */

export class StorageError extends Error {}

function requireToken(): void {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    throw new StorageError(
      'No file storage is connected. Create Vercel Blob storage and put BLOB_READ_WRITE_TOKEN in the environment — covers and book uploads need it, the rest of the shop does not.',
    );
  }
}

/** Stores one file and returns the address to keep in the database. */
export async function putStorageFile(
  folder: StorageFolder,
  fileName: string,
  bytes: Uint8Array | ArrayBuffer,
  contentType: string,
  options: { overwrite?: boolean } = {},
): Promise<string> {
  requireToken();
  const key = storageKeyFor(folder, fileName);
  const body = bytes instanceof Uint8Array ? Buffer.from(bytes) : bytes;
  // Generated names carry a random suffix, so an upload can never land on a
  // neighbour's file. Only a re-seed asks to overwrite its own demo title.
  const blob = await put(key, body, {
    access: 'public',
    contentType,
    addRandomSuffix: false,
    allowOverwrite: options.overwrite === true,
  });
  return blob.url;
}

/**
 * Bytes behind a stored address, or null when the address is not one this app
 * would ever have written. The address comes from the database, so it is
 * re-validated here rather than trusted because a caller looked it up first.
 */
export async function readStoredFile(address: string | null | undefined): Promise<Buffer | null> {
  const object = storedObjectFor(address);
  if (!object) return null;
  try {
    const response = await fetch(object.url, { signal: AbortSignal.timeout(20_000) });
    if (!response.ok) return null;
    return Buffer.from(await response.arrayBuffer());
  } catch {
    return null;
  }
}
