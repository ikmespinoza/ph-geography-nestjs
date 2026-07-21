import { PrismaPg } from '@prisma/adapter-pg';
import { config as loadDotenv } from 'dotenv';

import { CLASSIFICATIONS } from '@/config/constants';
import { PrismaClient } from '@/generated/prisma/client';

import { seedClassifications } from '../prisma/seed';

// DB-integration tests for the PHG-004 schema + seed. These need a live database,
// so resolve the real connection string from `.env` (dev DB on 5433) — bypassing
// the dummy URL that setup-env.ts sets for the DB-free liveness e2e — and fall back
// to an externally-provided DATABASE_URL (CI).
const databaseUrl = loadDotenv().parsed?.DATABASE_URL ?? process.env.DATABASE_URL;

const SEEDED_CODES = CLASSIFICATIONS.map((c) => c.code);

describe('Schema & seed (e2e)', () => {
  let prisma: PrismaClient;

  beforeAll(async () => {
    prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) });
    await prisma.$connect();
  });

  afterAll(async () => {
    // Remove rows these tests created; region cascade clears its provinces/cities.
    await prisma.region.deleteMany({ where: { code: { startsWith: 'ZZ-' } } });
    await prisma.classification.deleteMany({ where: { code: { startsWith: 'ZZ-' } } });
    await prisma.$disconnect();
  });

  describe('FK cascade', () => {
    it('deleting a region cascades to its provinces and cities', async () => {
      const region = await prisma.region.create({
        data: { code: 'ZZ-CASC', name: 'Cascade Region', nameTl: 'Rehiyon', acronym: 'CR' },
      });
      const classification = await prisma.classification.create({
        data: { code: 'ZZ-C1', description: 'Cascade Class' },
      });
      const province = await prisma.province.create({
        data: {
          code: 'ZZ-CASC-P',
          name: 'Cascade Province',
          nameTl: 'Lalawigan',
          regionId: region.id,
        },
      });
      const city = await prisma.city.create({
        data: {
          name: 'Cascade City',
          fullName: 'City of Cascade',
          provinceId: province.id,
          classificationId: classification.id,
        },
      });

      await prisma.region.delete({ where: { id: region.id } });

      expect(await prisma.province.findUnique({ where: { id: province.id } })).toBeNull();
      expect(await prisma.city.findUnique({ where: { id: city.id } })).toBeNull();
      // The classification is a parent of the city, not a child of the region — it survives.
      expect(
        await prisma.classification.findUnique({ where: { id: classification.id } }),
      ).not.toBeNull();
    });
  });

  describe('Unique constraints', () => {
    it('rejects a duplicate region code', async () => {
      await prisma.region.create({
        data: { code: 'ZZ-UNIQ', name: 'First', nameTl: 'Una', acronym: 'F' },
      });

      await expect(
        prisma.region.create({
          data: { code: 'ZZ-UNIQ', name: 'Second', nameTl: 'Pangalawa', acronym: 'S' },
        }),
      ).rejects.toMatchObject({ code: 'P2002' });
    });

    it('enforces the city natural key (province_id + name) but allows the same name in another province', async () => {
      const region = await prisma.region.create({
        data: { code: 'ZZ-CITY', name: 'City Region', nameTl: 'Rehiyon', acronym: 'CTR' },
      });
      const classification = await prisma.classification.create({
        data: { code: 'ZZ-C2', description: 'City Class' },
      });
      const [provinceA, provinceB] = await Promise.all([
        prisma.province.create({
          data: {
            code: 'ZZ-CITY-PA',
            name: 'Province A',
            nameTl: 'Lalawigan A',
            regionId: region.id,
          },
        }),
        prisma.province.create({
          data: {
            code: 'ZZ-CITY-PB',
            name: 'Province B',
            nameTl: 'Lalawigan B',
            regionId: region.id,
          },
        }),
      ]);

      await prisma.city.create({
        data: {
          name: 'Twin Town',
          fullName: 'Twin Town A',
          provinceId: provinceA.id,
          classificationId: classification.id,
        },
      });

      // Same name within the same province violates the composite unique key.
      await expect(
        prisma.city.create({
          data: {
            name: 'Twin Town',
            fullName: 'Twin Town A2',
            provinceId: provinceA.id,
            classificationId: classification.id,
          },
        }),
      ).rejects.toMatchObject({ code: 'P2002' });

      // Same name in a different province is allowed (key is province-scoped).
      const twinInB = await prisma.city.create({
        data: {
          name: 'Twin Town',
          fullName: 'Twin Town B',
          provinceId: provinceB.id,
          classificationId: classification.id,
        },
      });
      expect(twinInB.id).toBeDefined();
    });
  });

  describe('Classification seed', () => {
    it('seeds exactly the four classifications and is idempotent', async () => {
      const canonical = { where: { code: { in: SEEDED_CODES } } };

      await seedClassifications(prisma);
      expect(await prisma.classification.count(canonical)).toBe(4);

      // Re-run: no duplicates, no changes.
      await seedClassifications(prisma);
      expect(await prisma.classification.count(canonical)).toBe(4);

      const rows = await prisma.classification.findMany({
        ...canonical,
        select: { code: true, description: true },
      });
      expect(rows).toHaveLength(4);
      const descriptionByCode = Object.fromEntries(rows.map((r) => [r.code, r.description]));
      for (const c of CLASSIFICATIONS) {
        expect(descriptionByCode[c.code]).toBe(c.name);
      }
    });
  });
});
