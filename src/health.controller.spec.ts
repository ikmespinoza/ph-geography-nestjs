import { Test } from '@nestjs/testing';
import type { TestingModule } from '@nestjs/testing';

import { HealthController } from '@/health.controller';

describe('HealthController', () => {
  let controller: HealthController;

  beforeEach(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
    }).compile();

    controller = moduleRef.get(HealthController);
  });

  it('is defined', () => {
    expect(controller).toBeDefined();
  });

  it('returns an ok status', () => {
    expect(controller.check()).toEqual({ status: 'ok' });
  });
});
