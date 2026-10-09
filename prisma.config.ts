import 'dotenv/config';
import { defineConfig } from 'prisma/config';

// `env('DATABASE_URL')` used to throw here, which broke `prisma generate` — the
// first half of the build script — on any machine that has no database yet, such
// as a deploy builder. Generating a client only reads the schema, so the URL it
// falls back to here is never opened; the commands that do connect (db push,
// migrate, studio) still need the real DATABASE_URL set.
export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed.ts',
  },
  datasource: {
    url: process.env.DATABASE_URL ?? 'file:./dev.db',
  },
});
