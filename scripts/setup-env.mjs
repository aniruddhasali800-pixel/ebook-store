/**
 * Writes the two values the app cannot start without, and never overwrites an
 * existing .env — losing APP_SECRET makes the stored payee UPI ID and every
 * session unreadable.
 *
 *   npm run setup:env
 */
import { randomBytes } from 'node:crypto';
import { existsSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const file = resolve(process.cwd(), '.env');

if (existsSync(file)) {
  console.log(`${file} already exists. Left untouched — a changed APP_SECRET would make the stored UPI ID unreadable.`);
  process.exit(0);
}

const lines = [
  '# Local development secrets (gitignored)',
  'DATABASE_URL="file:./dev.db"',
  `APP_SECRET="${randomBytes(32).toString('base64url')}"`,
  '',
];

writeFileSync(file, lines.join('\n'), { mode: 0o600 });
console.log(`Wrote ${file} with a fresh APP_SECRET. Keep it backed up and out of any screenshot.`);
