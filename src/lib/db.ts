import 'server-only';
import type { PrismaClient } from '@/generated/prisma/client';
import { createPrismaClient } from '@/lib/db-client';

/**
 * Prisma 7 connects through a driver adapter, so the Postgres connection string
 * lives here (runtime) as well as in prisma.config.ts (migrations). There is no
 * fallback any more: a file path used to sit behind `?? 'file:./dev.db'`, and on
 * a hosted runtime that fallback would quietly open an empty database on
 * throwaway disk instead of failing. An order nobody can look up is worse than a
 * crashed request, so this throws before anything is queried.
 */
function databaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      'DATABASE_URL is missing. Set it to the Postgres connection string — `npm run setup:env` writes the local .env, and Vercel holds it in Project Settings → Environment Variables.',
    );
  }
  // A connection string that starts `file:` is the one this app used before it moved
  // to Postgres, and it sits in a .env on any machine that ran the old setup. pg does
  // not say that plainly — it tries to open a socket — so the two words that tell the
  // story are checked here, at the moment the pool is asked for.
  if (!/^postgres(ql)?:\/\//i.test(url)) {
    throw new Error(
      'DATABASE_URL is not a Postgres connection string. The shop moved off the SQLite file: point it at a Postgres database and run `npm run db:push` once against it.',
    );
  }
  return url;
}

/**
 * Made on the first query, not on import, and reached through a proxy so that
 * `prisma.order.findMany(…)` reads normally.
 *
 * The build step imports every route to collect its config without ever running
 * one, and a deploy builder may be handed the secret later than it is handed the
 * code. Opening a pool at import made `npm run build` fail for a missing
 * DATABASE_URL — a build-time crash over a connection nobody had tried to make
 * yet. Now the empty object is only a stand-in until something asks it for a
 * model, and that is exactly the moment the missing URL becomes an error.
 */
let client: PrismaClient | null = null;

function get(): PrismaClient {
  const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };
  // Reuse one client across dev hot reloads, otherwise each edit opens a new
  // pool until the process runs out of sockets. Production instances get their
  // own, and a pool is worth more than the cost of holding it.
  globalForPrisma.prisma ??= createPrismaClient(databaseUrl());
  client ??= globalForPrisma.prisma;
  return client;
}

export const prisma = new Proxy({} as PrismaClient, {
  get(_target, property) {
    return Reflect.get(get(), property);
  },
});
