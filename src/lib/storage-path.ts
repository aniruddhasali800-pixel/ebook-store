/**
 * The one place that decides what a stored file address is allowed to look like.
 *
 * Book files and cover images live in object storage, and the database columns
 * holding their addresses are editable text — the dashboard has a field for them
 * as well as the upload path — so every read goes through here before any byte is
 * fetched. An address is only honoured when it is an https URL on the storage
 * host, with a path of exactly `storage/books/<file>` or `storage/covers/<file>`.
 * Anything else returns null, and callers treat that as "no file" rather than
 * going to the network with somebody else's address.
 */

const STORAGE_HOST_SUFFIX = '.blob.vercel-storage.com';
const FILE_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;

export const STORAGE_FOLDERS = ['books', 'covers'] as const;
export type StorageFolder = (typeof STORAGE_FOLDERS)[number];

export type StoredObject = {
  /** Absolute URL, safe to fetch. */
  url: string;
  /** `storage/<folder>/<file>`, the name the object is stored under. */
  key: string;
  folder: StorageFolder;
  fileName: string;
};

export function storageKeyFor(folder: StorageFolder, fileName: string): string {
  if (!FILE_NAME.test(fileName)) {
    throw new TypeError(`Not a usable file name: ${fileName}`);
  }
  return `storage/${folder}/${fileName}`;
}

export function isStorageFolder(value: string): value is StorageFolder {
  return (STORAGE_FOLDERS as readonly string[]).includes(value);
}

export function storedObjectFor(value: string | null | undefined): StoredObject | null {
  if (!value) return null;

  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return null;
  }
  if (parsed.protocol !== 'https:') return null;
  if (!parsed.hostname.toLowerCase().endsWith(STORAGE_HOST_SUFFIX)) return null;
  // A port would take the request somewhere the storage host does not live.
  if (parsed.port !== '') return null;
  if (parsed.username || parsed.password) return null;
  if (parsed.search || parsed.hash) return null;

  const segments = parsed.pathname.split('/').filter((part) => part !== '');
  const [storageWord, folderWord, fileName, ...extra] = segments;
  if (storageWord !== 'storage' || !folderWord || !isStorageFolder(folderWord) || extra.length > 0) {
    return null;
  }
  // The URL parser settles `.` and `..` before this sees the path, so what is
  // checked here is always a resolved one: a path that climbed out of `storage/`
  // already failed the folder test above, and a path that climbed back in names
  // an object the shop could have written itself.
  if (!fileName || !FILE_NAME.test(fileName)) return null;

  return { url: parsed.toString(), key: `storage/${folderWord}/${fileName}`, folder: folderWord, fileName };
}
