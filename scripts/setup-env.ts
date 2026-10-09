/**
 * Writes the values the app cannot work without, and never overwrites an existing
 * .env — losing APP_SECRET makes the stored payee UPI ID and every session
 * unreadable, and a rotated secret is not something a helper should do quietly.
 *
 *   npm run setup:env
 *
 * The hosted values are typed at the keyboard and are not echoed: a Postgres
 * connection string carries its password in plain text, and a blob token is a
 * write key for the shop's files.
 */
import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ask, askHidden, closePrompt } from './hidden-prompt';

const file = resolve(process.cwd(), '.env');

const KEYS = [
  {
    key: 'DATABASE_URL',
    label: 'Postgres connection string (pooled, password included, not echoed)',
    // A hosted string always carries a scheme; anything else is a typo or a file
    // path from the SQLite days, which this app can no longer open.
    validate: (value: string) =>
      /^postgres(ql):\/\//.test(value) ? null : 'It has to start with postgres:// or postgresql://.',
  },
  {
    key: 'BLOB_READ_WRITE_TOKEN',
    label: 'Vercel Blob read-write token, for covers and book files (not echoed)',
    validate: (value: string) => (value.startsWith('blob_') ? null : 'Blob tokens start with "blob_".'),
  },
] as const;

function presentIn(content: string, key: string): boolean {
  const line = content.split('\n').find((candidate) => candidate.startsWith(`${key}=`));
  return Boolean(line && line.slice(key.length + 1).replace(/^"|"$/g, '').trim());
}

async function main() {
  if (existsSync(file)) {
    let content = readFileSync(file, 'utf8');
    const missing = KEYS.filter(({ key }) => !presentIn(content, key));
    console.log(`${file} already exists. Left untouched.`);
    if (!presentIn(content, 'APP_SECRET')) {
      console.log('APP_SECRET is missing from it, which blocks sign-ins and the stored UPI ID.');
    }
    for (const { key, label } of missing) {
      const value = await collect(label);
      writeFileSync(file, `${content.trimEnd()}\n${key}="${value}"\n`, { mode: 0o600 });
      content = readFileSync(file, 'utf8');
      console.log(`Appended ${key}.`);
    }
    if (missing.length === 0 && presentIn(content, 'APP_SECRET')) {
      console.log('All three values are present. Nothing to do.');
    }
    return;
  }

  const lines = ['# Local development secrets (gitignored)', `APP_SECRET="${randomBytes(32).toString('base64url')}"`];
  for (const { key, label } of KEYS) {
    lines.push(`${key}="${await collect(label)}"`);
  }
  writeFileSync(file, `${lines.join('\n')}\n`, { mode: 0o600 });
  console.log(
    `Wrote ${file} with a fresh APP_SECRET and the two hosted values. Keep it backed up and out of any screenshot.`,
  );
  console.log('Next: npm run db:push, then npm run db:seed, then npm run staff:add.');
}

async function collect(label: string): Promise<string> {
  let guard = 0;
  while (true) {
    const value = await askHidden(`${label}: `);
    if (value === '') {
      const skip = await ask('Nothing typed. Skip this one? It can be added later by running this script again [y/N]: ');
      if (skip.toLowerCase() === 'y') return '';
      continue;
    }
    const spec = KEYS.find((entry) => entry.label === label);
    const problem = spec ? spec.validate(value) : null;
    if (!problem) return value;
    console.log(problem);
    if (++guard > 2) {
      const force = await ask('Type it again, or reply s to skip [s/anything else]: ');
      if (force.toLowerCase() === 's') return '';
      guard = 0;
    }
  }
}

main()
  .catch((error) => {
    console.error(`\n${error instanceof Error ? error.message : error}`);
    process.exitCode = 1;
  })
  .finally(() => closePrompt());
