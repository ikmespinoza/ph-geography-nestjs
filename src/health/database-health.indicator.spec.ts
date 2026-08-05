import type { PrismaHealthIndicator } from '@nestjs/terminus';

import { DatabaseHealthIndicator } from '@/health/database-health.indicator';
import type { PrismaService } from '@/persistence/prisma.service';

describe('DatabaseHealthIndicator', () => {
  const pingCheck = jest.fn();
  const prisma = { $queryRawUnsafe: jest.fn() } as unknown as PrismaService;

  const build = (): DatabaseHealthIndicator =>
    new DatabaseHealthIndicator({ pingCheck } as unknown as PrismaHealthIndicator, prisma);

  beforeEach(() => {
    jest.resetAllMocks();
    pingCheck.mockResolvedValue({ database: { status: 'up' } });
  });

  it('pings the shared Prisma client under the `database` key', async () => {
    await build().check();

    expect(pingCheck).toHaveBeenCalledWith('database', prisma);
  });

  it('passes the indicator result straight through', async () => {
    await expect(build().check()).resolves.toEqual({ database: { status: 'up' } });
  });

  it('reports down without throwing when the ping fails', async () => {
    // Terminus catches the failure itself and returns a `down` result; the point here
    // is that this wrapper adds no try/catch of its own that could mask it.
    pingCheck.mockResolvedValue({ database: { status: 'down' } });

    await expect(build().check()).resolves.toEqual({ database: { status: 'down' } });
  });
});
