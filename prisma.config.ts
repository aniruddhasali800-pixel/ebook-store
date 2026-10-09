import 'dotenv/config';
import { defineConfig } from 'prisma/config';

// `env('DATABASE_URL')` used to throw here, which broke `prisma generate` — the
// first half of the build script — on any machine that has no database yet, such
// as a deploy builder. Generating a client only reads the schema, so the whole
// datasource section is left out until a URL actually exists. The commands that
// do connect (db push, migrate, studio) then report that they need one, rather
// than opening a placeholder socket and pretending it is the shop's database.
const databaseUrl = process.env.DATABASE_URL;

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed.ts',
  },
  ...(databaseUrl ? { datasource: { url: databaseUrl } } : {}),
});
