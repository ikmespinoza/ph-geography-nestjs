import { VersioningType } from '@nestjs/common';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { TestingModule } from '@nestjs/testing';
import request from 'supertest';

import { AppModule } from '@/app.module';
import { PrismaService } from '@/persistence/prisma.service';

describe('Health (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      // The liveness endpoint doesn't touch the database, but booting AppModule
      // would otherwise open a real connection on init. Stub PrismaService so this
      // e2e stays DB-free and portable; persistence is exercised by the endpoint
      // e2e specs (PHG-007+) and the health-check e2e (PHG-017) against a test DB.
      .overrideProvider(PrismaService)
      .useValue({
        onModuleInit: jest.fn().mockResolvedValue(undefined),
        onModuleDestroy: jest.fn().mockResolvedValue(undefined),
      })
      .compile();

    app = moduleRef.createNestApplication();
    // Mirror the production bootstrap so the versioned route resolves in-test.
    app.setGlobalPrefix('api');
    app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /api/v1/health -> 200 { status: "ok" }', async () => {
    await request(app.getHttpServer()).get('/api/v1/health').expect(200).expect({ status: 'ok' });
  });
});
