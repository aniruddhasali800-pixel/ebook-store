import 'dotenv/config';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { PrismaClient } from '@/generated/prisma/client';
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3';
import { encryptSecret, hashPassword, maskVpa } from '../src/lib/crypto';

const prisma = new PrismaClient({
  adapter: new PrismaBetterSqlite3({ url: process.env.DATABASE_URL ?? 'file:./dev.db' }),
});

const MENU: Array<{
  name: string;
  description: string;
  category: string;
  rupees: number;
  sortOrder: number;
}> = [
  { name: 'Masala Dosa', description: 'Crisp rice crepe with potato filling and chutneys', category: 'Main', rupees: 149, sortOrder: 1 },
  { name: 'Ghee Podi Dosa', description: 'Dosai with ground podi and ghee', category: 'Main', rupees: 179, sortOrder: 2 },
  { name: 'Idli (2 pcs)', description: 'Steamed rice cakes with sambar', category: 'Main', rupees: 99, sortOrder: 3 },
  { name: 'Vada (2 pcs)', description: 'Crisp urad dal doughnuts', category: 'Main', rupees: 89, sortOrder: 4 },
  { name: 'Paneer Butter Masala', description: 'Tomato cashew gravy, 12 pieces', category: 'Main', rupees: 259, sortOrder: 5 },
  { name: 'Jeera Rice', description: 'Cumin tempered short grain rice', category: 'Sides', rupees: 119, sortOrder: 6 },
  { name: 'Gulab Jamun (2 pcs)', description: 'Warm milk dumplings in syrup', category: 'Desserts', rupees: 79, sortOrder: 7 },
  { name: 'Filter Coffee', description: 'Strong decoction with frothed milk', category: 'Drinks', rupees: 49, sortOrder: 8 },
  { name: 'Sweet Lassi', description: 'Thick curd blended with cane sugar', category: 'Drinks', rupees: 89, sortOrder: 9 },
];

/**
 * Three things a kitchen genuinely runs out of, tied to three menu items, so the
 * inventory page has something to show on first open. The counts are only ever
 * written when a row is created — re-running the seed against a live shop must not
 * overwrite numbers a human counted this morning.
 */
const STOCK: Array<{
  name: string;
  unit: string;
  opening: number;
  par: number;
  menuItem: string;
}> = [
  { name: 'Dosa batter', unit: 'plates', opening: 40, par: 12, menuItem: 'Masala Dosa' },
  { name: 'Idli batter', unit: 'plates', opening: 24, par: 10, menuItem: 'Idli (2 pcs)' },
  { name: 'Coffee decoction', unit: 'litres', opening: 6, par: 4, menuItem: 'Filter Coffee' },
];

const BOOKS: Array<{
  slug: string;
  title: string;
  subtitle: string;
  author: string;
  blurb: string;
  contents: string[];
  rupees: number;
  listRupees: number;
  pages: number;
  category: string;
  sortOrder: number;
}> = [
  {
    slug: 'small-team-ai-playbook',
    title: 'The Small Team AI Playbook',
    subtitle: 'Fourteen automations you can ship this week',
    author: 'A. Salunkhe',
    blurb:
      'Most AI advice assumes a data team and a six-month roadmap. This does not. Each chapter is one automation, written end to end: the trigger, the prompt, the guardrail, and the number it moved.',
    contents: [
      'Choosing the first three jobs worth automating',
      'Prompt templates that survive contact with customers',
      'Evaluating output without a labelled dataset',
      'Cost ceilings, retries and kill switches',
      'Handing work back to a human without friction',
    ],
    rupees: 399,
    listRupees: 699,
    pages: 118,
    category: 'Practice',
    sortOrder: 1,
  },
  {
    slug: 'prompt-patterns-for-products',
    title: 'Prompt Patterns for Products',
    subtitle: 'Reusable prompt designs for real interfaces',
    author: 'A. Salunkhe',
    blurb:
      'A pattern catalogue rather than a tutorial. Twenty-two prompt shapes that keep working once they are wired into a shipping product, each with the failure mode it prevents.',
    contents: [
      'Constrained extraction and why schemas beat prose',
      'Two-pass drafting: generate, then grade',
      'Refusal design that users actually read',
      'Context windows as a budget you spend deliberately',
    ],
    rupees: 499,
    listRupees: 899,
    pages: 164,
    category: 'Engineering',
    sortOrder: 2,
  },
  {
    slug: 'shipping-agents-without-regret',
    title: 'Shipping Agents Without Regret',
    subtitle: 'Evaluation, guardrails and rollback for autonomous workflows',
    author: 'A. Salunkhe',
    blurb:
      'Agents break in ways unit tests never catch. This is the operational side: what to log, what to cap, when to stop the run, and how to prove it is safe before it touches a customer.',
    contents: [
      'Designing an eval set in an afternoon',
      'Tool allow-lists and blast radius',
      'Trace retention without leaking customer data',
      'Rollback plans for stateful runs',
    ],
    rupees: 599,
    listRupees: 1099,
    pages: 203,
    category: 'Engineering',
    sortOrder: 3,
  },
];

/**
 * A real, openable PDF so a verified order actually delivers a file.
 * Not a placeholder texture — the bytes are a valid one-page document.
 */
function makePdf(title: string, subtitle: string, lines: string[]): Buffer {
  const esc = (text: string) => text.replace(/[\\()]/g, (char) => `\\${char}`);
  const content = [
    'BT /F1 24 Tf 62 762 Td (' + esc(title) + ') Tj ET',
    'BT /F2 12 Tf 62 738 Td (' + esc(subtitle) + ') Tj ET',
    '0.6 0.45 0.2 RG 2 w 62 726 m 533 726 l S',
    ...lines.map((line, index) => `BT /F2 11 Tf 62 ${696 - index * 20} Td (${esc(line)}) Tj ET`),
  ].join('\n');

  const objects = [
    '<</Type/Catalog/Pages 2 0 R>>',
    '<</Type/Pages/Kids[3 0 R]/Count 1>>',
    '<</Type/Page/Parent 2 0 R/MediaBox[0 0 595 842]/Resources<</Font<</F1 5 0 R/F2 6 0 R>>>>/Contents 4 0 R>>',
    `<</Length ${content.length}>>\nstream\n${content}\nendstream`,
    '<</Type/Font/Subtype/Type1/BaseFont/Times-Bold>>',
    '<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>',
  ];

  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [];
  objects.forEach((body, index) => {
    offsets.push(Buffer.byteLength(pdf, 'latin1'));
    pdf += `${index + 1} 0 obj\n${body}\nendobj\n`;
  });

  const xref = Buffer.byteLength(pdf, 'latin1');
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) pdf += `${String(offset).padStart(10, '0')} 00000 n \n`;
  pdf += `trailer\n<</Size ${objects.length + 1}/Root 1 0 R>>\nstartxref\n${xref}\n%%PDF\n`;
  return Buffer.from(pdf, 'latin1');
}

function writeBookFile(book: (typeof BOOKS)[number]): string {
  const dir = path.join(process.cwd(), 'storage', 'books');
  mkdirSync(dir, { recursive: true });
  const relative = path.join('storage', 'books', `${book.slug}.pdf`);
  writeFileSync(
    path.join(process.cwd(), relative),
    makePdf(book.title, `${book.subtitle} — ${book.author}`, [
      '',
      'This is the sample file generated by `npm run db:seed`.',
      'Replace it with the real manuscript, then point the title at it from',
      'the shop dashboard. The download link unlocks only after the shop',
      'confirms the buyer paid.',
      '',
      'What is inside:',
      ...book.contents.map((line) => `  - ${line}`),
      '',
      `${book.pages} pages. Superseded by the paid copy in your account.`,
    ]),
  );
  return relative;
}

async function upsertUser(email: string, name: string, role: 'ADMIN' | 'CASHIER', password: string) {
  await prisma.user.upsert({
    where: { email },
    update: { role },
    create: { email, name, role, passwordHash: await hashPassword(password) },
  });
}

/**
 * Staff accounts come from the environment and nothing else.
 *
 * There used to be a default password here, printed in the README, which meant a
 * fresh install was guessable until somebody remembered to change it. Now a seed
 * without `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` seeds the shop and leaves the
 * door shut; the operator creates the first sign-in themselves, at their own
 * keyboard, with `npm run staff:add`.
 */
const STAFF_SPECS: Array<{ email?: string; name: string; role: 'ADMIN' | 'CASHIER'; password?: string }> = [
  {
    email: process.env.SEED_ADMIN_EMAIL,
    name: 'Owner',
    role: 'ADMIN',
    password: process.env.SEED_ADMIN_PASSWORD,
  },
  {
    email: process.env.SEED_CASHIER_EMAIL,
    name: 'Counter Staff',
    role: 'CASHIER',
    password: process.env.SEED_CASHIER_PASSWORD,
  },
];

async function seedStaff() {
  let created = 0;
  for (const spec of STAFF_SPECS) {
    if (!spec.email && !spec.password) continue;
    if (!spec.email || !spec.password) {
      throw new Error(`${spec.role} needs both SEED_${spec.role}_EMAIL and SEED_${spec.role}_PASSWORD, or neither.`);
    }
    if (spec.password.length < 12) {
      throw new Error(`The ${spec.role} password is shorter than 12 characters. Pick a longer one.`);
    }
    await upsertUser(spec.email.toLowerCase(), spec.name, spec.role, spec.password);
    created += 1;
  }
  if (created === 0) {
    console.log('No staff accounts seeded — run `npm run staff:add` to make the first one.');
  }
  return created;
}

async function main() {
  await seedStaff();

  for (const item of MENU) {
    const existing = await prisma.menuItem.findFirst({ where: { name: item.name } });
    const data = {
      name: item.name,
      description: item.description,
      category: item.category,
      priceInPaise: item.rupees * 100,
      available: true,
      sortOrder: item.sortOrder,
    };
    if (existing) await prisma.menuItem.update({ where: { id: existing.id }, data });
    else await prisma.menuItem.create({ data });
  }

  for (const item of STOCK) {
    const existing = await prisma.stockItem.findUnique({ where: { name: item.name } });
    if (existing) continue;
    // Only claim a menu item for one shelf row, and only if nothing else has it.
    const menu = await prisma.menuItem.findFirst({ where: { name: item.menuItem } });
    const claimed = menu
      ? await prisma.stockItem.findUnique({ where: { menuItemId: menu.id }, select: { id: true } })
      : null;
    await prisma.stockItem.create({
      data: {
        name: item.name,
        unit: item.unit,
        quantityOnHand: item.opening,
        parLevel: item.par,
        menuItemId: claimed ? null : (menu?.id ?? null),
        movements: {
          create: {
            kind: 'COUNT',
            deltaUnits: item.opening,
            balanceAfter: item.opening,
            note: 'Opening count from the seed',
          },
        },
      },
    });
  }

  for (const book of BOOKS) {
    const filePath = writeBookFile(book);
    const data = {
      slug: book.slug,
      title: book.title,
      subtitle: book.subtitle,
      author: book.author,
      blurb: book.blurb,
      contents: book.contents.join('\n'),
      priceInPaise: book.rupees * 100,
      listPriceInPaise: book.listRupees * 100,
      format: 'PDF',
      pages: book.pages,
      filePath,
      category: book.category,
      published: true,
      sortOrder: book.sortOrder,
    };
    const existing = await prisma.book.findUnique({ where: { slug: book.slug } });
    if (existing) await prisma.book.update({ where: { id: existing.id }, data });
    else await prisma.book.create({ data });
  }

  const payeeVpa = process.env.SEED_UPI_ID ?? 'demo-cafe@okhdfcbank';
  const payeeName = process.env.SEED_BUSINESS_NAME ?? 'Demo Cafe';
  const existingSettings = await prisma.paymentSetting.findUnique({ where: { id: 'default' } });
  let payeeMask = existingSettings?.upiIdMasked ?? null;
  if (!existingSettings) {
    await prisma.paymentSetting.create({
      data: {
        id: 'default',
        businessName: payeeName,
        upiPayeeName: payeeName,
        upiIdEncrypted: encryptSecret(payeeVpa),
        upiIdMasked: maskVpa(payeeVpa),
        enabled: true,
        currency: 'INR',
      },
    });
    payeeMask = maskVpa(payeeVpa);
  }

  const counts = {
    users: await prisma.user.count(),
    menuItems: await prisma.menuItem.count(),
    books: await prisma.book.count(),
    orders: await prisma.order.count(),
  };
  console.log(
    `Seeded: ${counts.users} users, ${counts.menuItems} menu items, ${counts.books} books, ${counts.orders} orders.`,
  );
  console.log(`Staff accounts on file: ${counts.users}. Passwords are never printed here.`);
  console.log(`Payee UPI ID configured: ${payeeMask} (plaintext stored encrypted at rest)`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
