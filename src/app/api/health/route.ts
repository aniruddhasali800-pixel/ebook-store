import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

/**
 * What the shop can reach right now, answered in one request.
 *
 * A deployed page that cannot read its database returns a 500 with the cause
 * hidden — Next deliberately does not tell a stranger why it failed, and the
 * reason lives in a dashboard only the owner can open. This route is the part
 * that is safe to make public: which switches are on, whether a query completes,
 * whether the tables exist yet. It reports the *shape* of the problem and never a
 * value — no connection string, no host, no secret, not even a masked piece of
 * one — so it can be read by whoever is operating the shop without widening who
 * can see anything.
 *
 * It always answers 200. A health check that itself 500s cannot be told apart
 * from the failure it is trying to describe.
 */
export const dynamic = 'force-dynamic';

type Check = { ok: boolean; detail: string };

const QUERY_TIMEOUT_MS = 5_000;

export async function GET() {
  const url = process.env.DATABASE_URL ?? '';
  const configured = /^postgres(ql)?:\/\//i.test(url);
  const secret = appSecretCheck();

  const database: Check = !url
    ? { ok: false, detail: 'DATABASE_URL is not set for this deployment' }
    : !configured
      ? { ok: false, detail: 'DATABASE_URL is set but is not a Postgres connection string' }
      : await probeDatabase();

  return NextResponse.json(
    {
      ok: database.ok && secret.ok,
      // Which commit is actually serving traffic, so a redeploy can be confirmed
      // from outside the dashboard.
      release: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? 'unknown',
      region: process.env.VERCEL_REGION ?? 'local',
      runtime: `node ${process.versions.node}`,
      checks: { database, appSecret: secret, blobStorage: blobStorage() },
    },
    { headers: { 'cache-control': 'no-store' } },
  );
}

/**
 * One query, with a ceiling. A connection that hangs is reported as a timeout
 * rather than holding the request open until the platform cuts it off.
 */
async function probeDatabase(): Promise<Check> {
  try {
    const reached = await Promise.race([
      prisma.$queryRaw`select 1`.then(() => true),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('timeout')), QUERY_TIMEOUT_MS),
      ),
    ]);
    if (!reached) return { ok: false, detail: 'the query returned nothing' };
  } catch (error) {
    return { ok: false, detail: `connected? no — ${reasonOf(error)}` };
  }

  try {
    const orders = await prisma.order.count();
    return { ok: true, detail: `queries answer, ${orders} order${orders === 1 ? '' : 's'} recorded` };
  } catch (error) {
    // The database is reachable but the schema is not there yet — the state right
    // after a database is created and before `npm run db:push` has been run.
    return { ok: false, detail: `connected, but the tables are not there yet — ${reasonOf(error)}` };
  }
}

const APP_SECRET_MINIMUM = 32;

function appSecretCheck(): Check {
  const value = process.env.APP_SECRET ?? '';
  if (value.length >= APP_SECRET_MINIMUM) return { ok: true, detail: 'set' };
  return {
    ok: false,
    detail: value
      ? `set but shorter than ${APP_SECRET_MINIMUM} characters`
      : 'not set — no payee VPA is readable and nobody can sign in',
  };
}

function blobStorage(): Check {
  return process.env.BLOB_READ_WRITE_TOKEN
    ? { ok: true, detail: 'a token is present; uploads will reach it' }
    : { ok: false, detail: 'BLOB_READ_WRITE_TOKEN is not set — book files cannot be uploaded or read' };
}

/**
 * The error's family, not its text. A driver message can carry the host and port
 * it failed to reach, which is not something to hand to an anonymous caller, so
 * the answer is narrowed to the handful of names that actually explain a failure.
 */
function reasonOf(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  const known = [
    'P1001', // cannot reach the database server
    'P1000', // authentication failed
    'P2021', // a table does not exist yet
    'P2022', // a column does not exist yet
    'ECONNREFUSED',
    'ENOTFOUND',
    'ETIMEDOUT',
    'timeout',
    'certificate',
    'self-signed',
    'password authentication failed',
  ];
  const hit = known.find((code) => message.toLowerCase().includes(code.toLowerCase()));
  if (hit) return hit;
  return message.toLowerCase().includes('ssl') ? 'ssl negotiation' : 'an unrecognised connection error';
}
