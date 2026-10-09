/**
 * Set the shop's own staff sign-ins, from a terminal, so a password never lands
 * in a file, a shell history line or another person's screen.
 *
 *   npm run staff:list
 *   npm run staff:add                       # a cashier, or a second admin
 *   npm run staff:rotate -- admin@upi.local # change that account's email + password
 *
 * The seed used to hand out `admin@upi.local / Admin#12345` and those values are
 * printed in this project's README, so they are the first thing to replace on any
 * machine that is not your own.
 */
import { createInterface } from 'node:readline';
import { PrismaClient } from '@/generated/prisma/client';
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3';
import { hashPassword } from '../src/lib/crypto';

const prisma = new PrismaClient({
  adapter: new PrismaBetterSqlite3({ url: process.env.DATABASE_URL ?? 'file:./dev.db' }),
});

const MIN_PASSWORD = 12;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const ROLES = ['ADMIN', 'CASHIER'] as const;
type Role = (typeof ROLES)[number];

const rl = createInterface({ input: process.stdin, output: process.stdout });

function ask(question: string): Promise<string> {
  return new Promise((resolve) => rl.question(question, (answer) => resolve(answer.trim())));
}

/**
 * Character-by-character stdin with the echo turned off, so the password does not
 * appear on screen or in a terminal recording. Ctrl-C still cancels.
 */
function askHidden(question: string): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!process.stdin.isTTY) {
      reject(new Error('This is not a terminal. Run it from a real prompt so the password stays hidden.'));
      return;
    }
    process.stdout.write(question);
    const chars: string[] = [];
    // readline owns stdin for the visible prompts; hand it over while raw.
    rl.pause();
    process.stdin.setRawMode(true);
    process.stdin.resume();

    const finish = (value: string | null) => {
      process.stdin.removeListener('data', onData);
      process.stdin.setRawMode(false);
      process.stdin.pause();
      rl.resume();
      process.stdout.write('\n');
      if (value === null) reject(new Error('cancelled'));
      else resolve(value);
    };

    function onData(chunk: Buffer) {
      for (const char of chunk.toString('utf8')) {
        if (char === '\u0003') return finish(null); // Ctrl-C
        if (char === '\r' || char === '\n') return finish(chars.join(''));
        if (char === '\u007f' || char === '\b') chars.pop();
        else if (char >= ' ') chars.push(char);
      }
    }

    process.stdin.on('data', onData);
  });
}

async function askPassword(): Promise<string> {
  while (true) {
    const first = await askHidden(`Password (${MIN_PASSWORD} characters or more, not echoed): `);
    if (first.length < MIN_PASSWORD) {
      process.stdout.write(`Too short — ${MIN_PASSWORD} characters minimum.\n`);
      continue;
    }
    const again = await askHidden('Type it once more: ');
    if (first !== again) {
      process.stdout.write('Those did not match. Start again.\n');
      continue;
    }
    return first;
  }
}

function looksLikeId(value: string): boolean {
  return value.startsWith('c') && value.length === 25;
}

async function findStaff(identifier: string) {
  return looksLikeId(identifier)
    ? prisma.user.findUnique({ where: { id: identifier } })
    : prisma.user.findUnique({ where: { email: identifier.toLowerCase() } });
}

async function chooseRole(current: Role = 'CASHIER'): Promise<Role> {
  const answer = await ask(`Role [${current}] (ADMIN or CASHIER): `);
  if (!answer) return current;
  const upper = answer.toUpperCase();
  if (!ROLES.includes(upper as Role)) throw new Error(`Unknown role "${answer}". Use ADMIN or CASHIER.`);
  return upper as Role;
}

async function list() {
  const users = await prisma.user.findMany({ orderBy: { createdAt: 'asc' } });
  if (users.length === 0) {
    console.log('No staff accounts yet. Run: npm run staff:add');
    return;
  }
  console.log(`${users.length} staff account(s):`);
  for (const user of users) {
    console.log(`  ${user.role.padEnd(8)} ${user.email.padEnd(34)} ${user.name}  (id ${user.id})`);
  }
  console.log('\nRotate one with: npm run staff:rotate -- <email or id>');
}

async function add() {
  const email = (await ask('Sign-in email: ')).toLowerCase();
  if (!EMAIL.test(email)) throw new Error('That is not an email address.');
  if (await prisma.user.findUnique({ where: { email } })) throw new Error(`${email} already exists — rotate it instead.`);
  const name = (await ask('Name shown on the staff screens: ')) || 'Staff';
  const role = await chooseRole();
  const password = await askPassword();

  await prisma.user.create({ data: { email, name, role, passwordHash: await hashPassword(password) } });
  console.log(`\nAdded ${role} ${email}. Sign in at /login; the session lasts five idle minutes.`);
}

/** Changes the address and the password of one account, keeping its history. */
async function rotate(identifierArg?: string) {
  const identifier = identifierArg ?? (await ask('Which account? (email or id): '));
  const user = await findStaff(identifier);
  if (!user) throw new Error(`No staff account matches "${identifier}". Try npm run staff:list.`);

  const nextEmail = ((await ask(`Sign-in email [${user.email}]: `)) || user.email).toLowerCase();
  if (!EMAIL.test(nextEmail)) throw new Error('That is not an email address.');
  if (nextEmail !== user.email && (await prisma.user.findUnique({ where: { email: nextEmail } }))) {
    throw new Error(`${nextEmail} is already another account.`);
  }

  const nextName = (await ask(`Name [${user.name}]: `)) || user.name;
  const nextRole = await chooseRole(user.role as Role);

  // Losing the last admin means nobody can change the payee UPI ID again.
  if (user.role === 'ADMIN' && nextRole !== 'ADMIN') {
    const admins = await prisma.user.count({ where: { role: 'ADMIN' } });
    if (admins <= 1) throw new Error('This is the only ADMIN account. Add another admin before demoting it.');
  }

  const password = await askPassword();
  await prisma.user.update({
    where: { id: user.id },
    data: { email: nextEmail, name: nextName, role: nextRole, passwordHash: await hashPassword(password) },
  });

  console.log(`\nUpdated ${nextRole} ${nextEmail}. Any signed-in screen on this account is now logged out within five minutes.`);
}

async function main() {
  const [command, argument] = process.argv.slice(2);
  switch (command) {
    case 'list':
      await list();
      break;
    case 'add':
      await add();
      break;
    case 'rotate':
      await rotate(argument);
      break;
    default:
      console.log('Usage:\n  npm run staff:list\n  npm run staff:add\n  npm run staff:rotate -- <email or id>');
      process.exitCode = 1;
  }
}

main()
  .catch((error) => {
    console.error(`\n${error instanceof Error ? error.message : error}`);
    process.exitCode = 1;
  })
  .finally(() => {
    rl.close();
    return prisma.$disconnect();
  });
