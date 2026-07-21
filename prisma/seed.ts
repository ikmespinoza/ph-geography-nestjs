import 'dotenv/config';

import { PrismaPg } from '@prisma/adapter-pg';

import { CLASSIFICATIONS } from '../src/config/constants';
import { PrismaClient } from '../src/generated/prisma/client';

/**
 * Upsert the four static LGU classifications by their natural key (`code`).
 * Idempotent: a re-run updates in place and never duplicates. Exported so tests
 * can drive it against a live test database.
 */
export async function seedClassifications(prisma: PrismaClient): Promise<void> {
  for (const { code, name } of CLASSIFICATIONS) {
    await prisma.classification.upsert({
      where: { code },
      update: { description: name },
      create: { code, description: name },
    });
  }
}

/**
 * Idempotent database seed entry point. Run via `pnpm db:seed` (→ `prisma db seed`)
 * and automatically after `migrate dev` / `migrate reset`. This is CLI/build
 * tooling, so — like `prisma.config.ts` — it reads `DATABASE_URL` directly rather
 * than through the Nest config layer, and connects through the same `pg` driver
 * adapter the app uses.
 */
async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error('DATABASE_URL is not set — cannot seed. Copy .env.example to .env first.');
  }

  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });

  try {
    await seedClassifications(prisma);
    const count = await prisma.classification.count();
    console.log(`Seed complete — ${count} classifications present.`);
  } finally {
    await prisma.$disconnect();
  }
}

// Only self-execute when run as a script; importing (tests) must not seed.
if (require.main === module) {
  main().catch((error: unknown) => {
    console.error('Seed failed:', error);
    process.exitCode = 1;
  });
}
