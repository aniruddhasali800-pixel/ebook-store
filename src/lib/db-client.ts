import pg from 'pg';
import { PrismaClient } from '@/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

/**
 * The one place a Postgres pool is built, shared by the app (src/lib/db.ts) and
 * the terminal scripts (prisma/seed.ts, scripts/staff.ts) so a password prompt
 * and a seed run cannot drift onto different connection settings.
 */
export function createPrismaClient(connectionString: string): PrismaClient {
  return new PrismaClient({ adapter: new PrismaPg(buildPool(connectionString)) });
}

function buildPool(connectionString: string): pg.Pool {
  // A serverless instance is short-lived and can be scaled out, so it must not
  // hold a default ten connections each against a shared free-tier database.
  // Idle sockets are dropped quickly to leave room for the other instances.
  return new pg.Pool({
    connectionString,
    max: 3,
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 10_000,
    // Hosted Postgres refuses plain-text sockets, and a pasted connection string
    // does not always say so itself. Only a local server may go unencrypted.
    ssl: /^postgres(ql)?:\/\/(localhost|127\.0\.0\.1|\[::1\])[:/]/i.test(connectionString)
      ? undefined
      : { rejectUnauthorized: true },
  });
}
