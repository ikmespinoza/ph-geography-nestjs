// Prisma 7 CLI configuration. Prisma no longer reads `.env` automatically nor
// accepts a datasource `url` in schema.prisma, so both are wired here:
//  - `dotenv/config` loads `.env` (same file @nestjs/config uses at app runtime),
//    giving migrate/introspect commands DATABASE_URL without polluting the shell.
//  - `datasource.url` is intentionally optional: it is only needed by migration
//    commands. Leaving it undefined lets `prisma generate` (and the `postinstall`
//    hook) run before `.env` exists — matching the documented
//    `pnpm install` → `cp .env.example .env` first-run order. Migrate commands
//    fail loudly with a clear message if DATABASE_URL is missing.
//
// This is CLI-only build tooling at the repo root, not app runtime code — the
// runtime client reads its connection through the config layer (PrismaService).
import 'dotenv/config';
import path from 'node:path';

import { defineConfig } from 'prisma/config';

export default defineConfig({
  schema: path.join('prisma', 'schema.prisma'),
  migrations: {
    path: path.join('prisma', 'migrations'),
    // Single definition of the seed command: `prisma db seed` (→ `pnpm db:seed`)
    // and post-`migrate dev`/`migrate reset` all run this. `--transpile-only`
    // skips typechecking the generated client for a fast, dependency-light run.
    seed: 'ts-node --transpile-only prisma/seed.ts',
  },
  datasource: {
    url: process.env.DATABASE_URL,
  },
});
