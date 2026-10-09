import test from 'node:test';
import assert from 'node:assert/strict';
import { storageKeyFor, storedObjectFor } from '../src/lib/storage-path';

/**
 * The book file and cover columns hold text an operator can edit from the
 * dashboard, and the app takes that text to the network. These are the cases where
 * "looks like a file address" must not become "fetch this", including the path
 * forms the SQLite-and-disk version of this shop used to store.
 */

const STORE = 'https://demo-store.blob.vercel-storage.com';

test('an address this app wrote reads back as the object it names', () => {
  const book = storedObjectFor(`${STORE}/storage/books/small-team-ai-playbook-a1b2c3d4e5f6.pdf`);
  assert.deepEqual(book, {
    url: `${STORE}/storage/books/small-team-ai-playbook-a1b2c3d4e5f6.pdf`,
    key: 'storage/books/small-team-ai-playbook-a1b2c3d4e5f6.pdf',
    folder: 'books',
    fileName: 'small-team-ai-playbook-a1b2c3d4e5f6.pdf',
  });

  assert.equal(storedObjectFor(`${STORE}/storage/covers/field-notes-737195967227.webp`)?.folder, 'covers');
});

test('the local paths of the disk era are refused, not read', () => {
  for (const stale of ['storage/books/playbook.pdf', './storage/books/playbook.pdf', '/storage/books/playbook.pdf']) {
    assert.equal(storedObjectFor(stale), null, `${stale} is not a fetchable address`);
  }
});

test('plain text, not a request', () => {
  for (const value of ['', '   ', 'javascript:alert(1)', 'data:text/plain,hi', 'file:///etc/passwd']) {
    assert.equal(storedObjectFor(value), null);
  }
});

test('https only, because a stored file never needs a redirect through a proxy', () => {
  assert.equal(storedObjectFor('http://demo-store.blob.vercel-storage.com/storage/books/a.pdf'), null);
});

test('the host has to be the storage host, and only the storage host', () => {
  const lookalikes = [
    'https://blob.vercel-storage.com.evil.test/storage/books/a.pdf',
    'https://evil.test/.blob.vercel-storage.com/storage/books/a.pdf',
    'https://evil.test/storage/books/a.pdf@blob.vercel-storage.com',
    'https://demo-store.blob.vercel-storage.com:8080/storage/books/a.pdf',
    'https://user:pass@demo-store.blob.vercel-storage.com/storage/books/a.pdf',
  ];
  for (const value of lookalikes) {
    assert.equal(storedObjectFor(value), null, `${value} is not the storage host`);
  }
});

test('nothing beyond the object name is honoured', () => {
  const base = 'https://demo-store.blob.vercel-storage.com/storage/books/a.pdf';
  assert.equal(storedObjectFor(`${base}?version=2`), null);
  assert.equal(storedObjectFor(`${base}#page=3`), null);
});

test('a path that nests or lands outside the two folders is refused', () => {
  const host = 'https://demo-store.blob.vercel-storage.com';
  for (const value of [
    `${host}/storage/books/two/deep/a.pdf`,
    `${host}/storage/a.pdf`,
    `${host}/storage/logs/a.pdf`,
    `${host}/storage/Books/a.pdf`,
    `${host}/storage/books/`,
  ]) {
    assert.equal(storedObjectFor(value), null, `${value} is not one of the two upload folders`);
  }
});

test('dots are resolved before the folder is judged, so they can only land inside it', () => {
  const host = 'https://demo-store.blob.vercel-storage.com';
  // The URL parser settles `..` and `.` itself. What matters is that the settled
  // path is still checked: a climb out of storage/ is refused, and a climb that
  // lands back inside storage/ names that object honestly rather than fetching
  // whatever the written value appeared to point at.
  assert.equal(storedObjectFor(`${host}/storage/books/../../etc/passwd`), null);
  assert.equal(storedObjectFor(`${host}/storage/books/../covers/a.pdf`)?.key, 'storage/covers/a.pdf');
  assert.equal(storedObjectFor(`${host}/storage/books/./a.pdf`)?.key, 'storage/books/a.pdf');
});

test('the file name a writer may use is the one a reader will accept', () => {
  assert.equal(storageKeyFor('books', 'small-team-ai-playbook-a1b2c3.pdf'), 'storage/books/small-team-ai-playbook-a1b2c3.pdf');
  for (const bad of ['..', '.', 'two words.pdf', 'a/b.pdf', '', '-leading.pdf', `${'x'.repeat(130)}.pdf`]) {
    assert.throws(() => storageKeyFor('books', bad), TypeError, `${bad} should never be stored`);
  }
});

test('a cover address is not a book address and neither is a wildcard', () => {
  const host = 'https://demo-store.blob.vercel-storage.com';
  assert.equal(storedObjectFor(`${host}/storage/covers/a.pdf`)?.folder, 'covers');
  assert.equal(storedObjectFor(`${host}/storage/books/a.pdf`)?.folder, 'books');
  assert.match(storedObjectFor(`${host}/storage/books/a.pdf`)!.url, /^https:\/\//);
});
