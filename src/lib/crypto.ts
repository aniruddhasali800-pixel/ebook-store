import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  hkdfSync,
  randomBytes,
  scrypt,
  timingSafeEqual,
} from 'node:crypto';
import { promisify } from 'node:util';

/**
 * Two keys derived (HKDF) from one secret (APP_SECRET):
 *   - settings encryption: AES-256-GCM at rest for the payee UPI ID
 *   - session signing: HMAC-SHA256 over the cookie payload
 * `derivedHmacKey` hands out further purpose-tagged keys, so a subsystem that
 * needs to sign something never reuses the session key.
 *
 * Both fail loudly rather than silently falling back to a default secret.
 *
 * No `server-only` guard here: prisma/seed.ts imports these functions from a
 * plain Node process. Callers from app code must never pass the results of
 * encrypt/decrypt into a Client Component.
 */

const KEY_LENGTH = 32;
const SEPARATOR = '.';
const scryptAsync = promisify(scrypt) as (
  password: string,
  salt: Buffer,
  keylen: number,
) => Promise<Buffer>;

export class ConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigurationError';
  }
}

function appSecret(): string {
  const secret = process.env.APP_SECRET;
  if (!secret || secret.length < 16) {
    throw new ConfigurationError('APP_SECRET is missing. Run `npm run setup:env` to generate it in .env.');
  }
  return secret;
}

function derive(purpose: string): Buffer {
  return Buffer.from(
    hkdfSync('sha256', Buffer.from(appSecret()), Buffer.from('upi-pay.v1'), Buffer.from(purpose), KEY_LENGTH),
  );
}

/**
 * Additional APP_SECRET-derived key, for subsystems that need their own HMAC
 * and have no dedicated secret of their own. Fails loudly without APP_SECRET,
 * exactly like the two keys above.
 */
export function derivedHmacKey(purpose: string): Buffer {
  return derive(purpose);
}

export function encryptSecret(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', derive('settings-encryption'), iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return ['v1', iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), encrypted.toString('base64url')].join(SEPARATOR);
}

export function decryptSecret(payload: string): string {
  const [version, ivPart, tagPart, dataPart] = payload.split(SEPARATOR);
  if (version !== 'v1' || !ivPart || !tagPart || !dataPart) {
    throw new ConfigurationError('Stored secret is not in a recognised format.');
  }
  const decipher = createDecipheriv('aes-256-gcm', derive('settings-encryption'), Buffer.from(ivPart, 'base64url'));
  decipher.setAuthTag(Buffer.from(tagPart, 'base64url'));
  try {
    return Buffer.concat([decipher.update(Buffer.from(dataPart, 'base64url')), decipher.final()]).toString('utf8');
  } catch {
    throw new ConfigurationError('Stored secret could not be decrypted. Check APP_SECRET.');
  }
}

/** Never reveal a stored VPA in full; settings forms show this and keep the plaintext server-side. */
export function maskVpa(vpa: string): string {
  const [local = '', handle = ''] = vpa.split('@');
  const visible = local.slice(0, Math.min(3, local.length));
  return `${visible}${'•'.repeat(Math.max(local.length - visible.length, 2))}@${handle}`;
}

export type SessionPayload = {
  userId: string;
  role: string;
  /** Epoch seconds. */
  expiresAt: number;
};

export function signSession(payload: SessionPayload): string {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${body}${SEPARATOR}${hmac(body)}`;
}

export function verifySession(token: string | undefined | null): SessionPayload | null {
  if (!token) return null;
  const separatorIndex = token.indexOf(SEPARATOR);
  if (separatorIndex <= 0) return null;
  const body = token.slice(0, separatorIndex);
  const signature = token.slice(separatorIndex + 1);
  if (!signature) return null;

  // Compare the encoded strings, not the decoded bytes: the last character of a
  // base64url digest carries unused bits, so decoded comparison would accept
  // several different tokens for the same signature.
  const expected = Buffer.from(hmac(body));
  const provided = Buffer.from(signature);
  if (expected.length !== provided.length || !timingSafeEqual(expected, provided)) return null;

  try {
    const parsed = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as SessionPayload;
    if (typeof parsed.expiresAt !== 'number' || parsed.expiresAt * 1000 <= Date.now()) return null;
    if (typeof parsed.userId !== 'string' || typeof parsed.role !== 'string') return null;
    return parsed;
  } catch {
    return null;
  }
}

function hmac(value: string): string {
  return createHmac('sha256', derive('session-signing')).update(value).digest('base64url');
}

/** scrypt keeps admin credential hashing dependency-free. */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scryptAsync(password, salt, 32);
  return `scrypt$${salt.toString('base64url')}$${key.toString('base64url')}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, saltPart, keyPart] = stored.split('$');
  if (scheme !== 'scrypt' || !saltPart || !keyPart) return false;
  const expected = Buffer.from(keyPart, 'base64url');
  const key = (await scryptAsync(password, Buffer.from(saltPart, 'base64url'), expected.length)) as Buffer;
  return key.length === expected.length && timingSafeEqual(key, expected);
}
