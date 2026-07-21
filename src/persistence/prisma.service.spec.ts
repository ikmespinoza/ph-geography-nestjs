import type { ConfigService } from '@nestjs/config';

import { PrismaService } from '@/persistence/prisma.service';

const DATABASE_URL = 'postgresql://user:pass@localhost:5432/ph_geography';

function createService(): { service: PrismaService; getOrThrow: jest.Mock } {
  const getOrThrow = jest.fn().mockReturnValue({ url: DATABASE_URL });
  const configService = { getOrThrow } as unknown as ConfigService;

  return { service: new PrismaService(configService), getOrThrow };
}

describe('PrismaService', () => {
  it('sources the connection string from the validated database config namespace', () => {
    const { getOrThrow } = createService();

    expect(getOrThrow).toHaveBeenCalledWith('database');
  });

  describe('onModuleInit', () => {
    it('connects on boot', async () => {
      const { service } = createService();
      const connect = jest.spyOn(service, '$connect').mockResolvedValue(undefined);

      await service.onModuleInit();

      expect(connect).toHaveBeenCalledTimes(1);
    });

    it('fails loudly when the database is unreachable', async () => {
      const { service } = createService();
      const failure = new Error('connection refused');
      jest.spyOn(service, '$connect').mockRejectedValue(failure);

      await expect(service.onModuleInit()).rejects.toThrow(failure);
    });
  });

  it('disconnects on shutdown', async () => {
    const { service } = createService();
    const disconnect = jest.spyOn(service, '$disconnect').mockResolvedValue(undefined);

    await service.onModuleDestroy();

    expect(disconnect).toHaveBeenCalledTimes(1);
  });

  it('pings the database with a lightweight SELECT 1 probe', async () => {
    const { service } = createService();
    const queryRaw = jest.spyOn(service, '$queryRaw').mockResolvedValue([{ result: 1 }]);

    await service.pingDatabase();

    expect(queryRaw).toHaveBeenCalledTimes(1);
  });
});
