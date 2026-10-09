import 'server-only';
import { PrismaClient } from '@/generated/prisma/client';
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3';

/**
 * Prisma 7 connects through a driver adapter, so the SQLite file path lives
 * here (runtime) as well as in prisma.config.ts (migrations).
 */
function databaseUrl(): string {
  return process.env.DATABASE_URL ?? 'file:./dev.db';
}

function createPrismaClient(): PrismaClient {
  return new PrismaClient({
    adapter: new PrismaBetterSqlite3({ url: databaseUrl() }),
  });
}

// Reuse one client across hot reloads, otherwise each edit opens a new SQLite
// handle until the process runs out.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma: PrismaClient = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;
