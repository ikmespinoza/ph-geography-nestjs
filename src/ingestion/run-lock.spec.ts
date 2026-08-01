import type { ConfigService } from '@nestjs/config';

import { RunLock } from '@/ingestion/run-lock';

const connect = jest.fn();
const query = jest.fn();
const end = jest.fn();

jest.mock('pg', () => ({
  Client: jest.fn().mockImplementation(() => ({ connect, query, end })),
}));

describe('RunLock', () => {
  const configService = {
    getOrThrow: () => ({ url: 'postgresql://u:p@localhost:5432/db' }),
  } as unknown as ConfigService;
  const lock = new RunLock(configService);

  beforeEach(() => {
    jest.clearAllMocks();
    connect.mockResolvedValue(undefined);
    end.mockResolvedValue(undefined);
  });

  it('returns a handle when the advisory lock is free', async () => {
    query.mockResolvedValue({ rows: [{ locked: true }] });

    const handle = await lock.acquire();

    expect(handle).not.toBeNull();
    expect(connect).toHaveBeenCalledTimes(1);
    expect(query).toHaveBeenCalledWith('SELECT pg_try_advisory_lock($1) AS locked', [
      expect.any(Number),
    ]);
    // Still held — nothing released it yet.
    expect(end).not.toHaveBeenCalled();
  });

  it('releases by closing its own session, which drops the lock', async () => {
    query.mockResolvedValue({ rows: [{ locked: true }] });

    await (await lock.acquire())?.release();

    expect(end).toHaveBeenCalledTimes(1);
  });

  it('returns null and closes the connection when another run holds the lock', async () => {
    query.mockResolvedValue({ rows: [{ locked: false }] });

    await expect(lock.acquire()).resolves.toBeNull();
    expect(end).toHaveBeenCalledTimes(1);
  });

  it('treats a missing row as "not acquired" rather than assuming success', async () => {
    query.mockResolvedValue({ rows: [] });

    await expect(lock.acquire()).resolves.toBeNull();
    expect(end).toHaveBeenCalledTimes(1);
  });

  it('closes the connection when the lock query itself fails', async () => {
    query.mockRejectedValue(new Error('connection reset'));

    await expect(lock.acquire()).rejects.toThrow('connection reset');
    expect(end).toHaveBeenCalledTimes(1);
  });

  it('does not let a failed close mask a completed run', async () => {
    query.mockResolvedValue({ rows: [{ locked: true }] });
    end.mockRejectedValue(new Error('already closed'));

    await expect((await lock.acquire())?.release()).resolves.toBeUndefined();
  });
});
