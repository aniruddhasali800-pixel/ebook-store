import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  ConfigurationError,
  decryptSecret,
  encryptSecret,
  hashPassword,
  maskVpa,
  signSession,
  verifyPassword,
  verifySession,
} from '../src/lib/crypto';

test('the payee UPI ID round-trips through at-rest encryption', () => {
  const stored = encryptSecret('demo-cafe@okhdfcbank');
  assert.notEqual(stored, 'demo-cafe@okhdfcbank');
  assert.ok(!stored.includes('okhdfcbank'), 'ciphertext must not leak the handle');
  assert.equal(decryptSecret(stored), 'demo-cafe@okhdfcbank');
});

test('two saves of the same UPI ID produce different ciphertext', () => {
  assert.notEqual(encryptSecret('a@ybl'), encryptSecret('a@ybl'));
});

test('a tampered ciphertext fails authentication instead of decrypting', () => {
  const stored = encryptSecret('demo-cafe@ybl');
  const parts = stored.split('.');
  parts[3] = parts[3].slice(0, -2) + 'AA';
  assert.throws(() => decryptSecret(parts.join('.')), ConfigurationError);
  assert.throws(() => decryptSecret('v1.OnlyThreeParts'), ConfigurationError);
});

test('the settings screen only ever sees a masked VPA', () => {
  assert.equal(maskVpa('demo-cafe@okhdfcbank'), 'dem••••••@okhdfcbank');
  assert.equal(maskVpa('ab@ybl'), 'ab••@ybl');
  assert.ok(!maskVpa('secret-shop@ybl').includes('secret'));
});

test('session tokens are signed, and edits invalidate them', () => {
  const token = signSession({ userId: 'u1', role: 'ADMIN', expiresAt: Math.floor(Date.now() / 1000) + 60 });
  assert.deepEqual(verifySession(token), {
    userId: 'u1',
    role: 'ADMIN',
    expiresAt: tokenPayload(token).expiresAt,
  });

  assert.equal(verifySession(`${token.slice(0, -2)}AA`), null);
  assert.equal(verifySession(`${token}.x`), null);
  assert.equal(verifySession('garbage'), null);
  assert.equal(verifySession(undefined), null);
});

test('an expired session is refused even with a valid signature', () => {
  const token = signSession({ userId: 'u1', role: 'ADMIN', expiresAt: Math.floor(Date.now() / 1000) - 1 });
  assert.equal(verifySession(token), null);
});

test('a role change requires re-signing the cookie', () => {
  const cashier = signSession({ userId: 'u1', role: 'CASHIER', expiresAt: Math.floor(Date.now() / 1000) + 60 });
  const [body, signature] = cashier.split('.');
  const forgedBody = Buffer.from(
    JSON.stringify({ userId: 'u1', role: 'ADMIN', expiresAt: Math.floor(Date.now() / 1000) + 60 }),
  ).toString('base64url');
  assert.equal(verifySession(`${forgedBody}.${signature}`), null);
  assert.equal(body.length > 0, true);
});

test('passwords verify, and a wrong one does not', async () => {
  const stored = await hashPassword('Admin#12345');
  assert.ok(stored.startsWith('scrypt$'));
  assert.ok(!stored.includes('Admin#12345'));
  assert.equal(await verifyPassword('Admin#12345', stored), true);
  assert.equal(await verifyPassword('admin#12345', stored), false);
  assert.equal(await verifyPassword('anything', 'not-a-hash'), false);
});

function tokenPayload(token: string) {
  return JSON.parse(Buffer.from(token.split('.')[0], 'base64url').toString('utf8'));
}
