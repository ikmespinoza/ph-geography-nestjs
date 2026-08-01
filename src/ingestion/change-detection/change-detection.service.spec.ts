import { ChangeDetectionService } from '@/ingestion/change-detection/change-detection.service';
import type { PrismaService } from '@/persistence/prisma.service';

const SOURCE = 'ISO 3166';
const SEEN = new Date('2025-07-29T13:25:00.000Z');

describe('ChangeDetectionService', () => {
  const findUnique = jest.fn();
  const upsert = jest.fn();
  const prisma = { sourceSyncState: { findUnique, upsert } } as unknown as PrismaService;
  const service = new ChangeDetectionService(prisma);

  beforeEach(() => {
    findUnique.mockReset();
    upsert.mockReset();
  });

  describe('shouldProcess', () => {
    it('processes on the first run, when no marker exists', async () => {
      findUnique.mockResolvedValue(null);

      await expect(service.shouldProcess(SOURCE, 'region', SEEN, false)).resolves.toBe(true);
      expect(findUnique).toHaveBeenCalledWith({
        where: { source_resource: { source: SOURCE, resource: 'region' } },
      });
    });

    it('skips when the source has not moved since the marker', async () => {
      findUnique.mockResolvedValue({ lastSeenAt: SEEN });

      await expect(service.shouldProcess(SOURCE, 'region', SEEN, false)).resolves.toBe(false);
    });

    it('skips when the source is older than the marker', async () => {
      findUnique.mockResolvedValue({ lastSeenAt: new Date('2026-01-01T00:00:00.000Z') });

      await expect(service.shouldProcess(SOURCE, 'city', SEEN, false)).resolves.toBe(false);
    });

    it('processes once the source advances — even by a minute', async () => {
      findUnique.mockResolvedValue({ lastSeenAt: SEEN });
      const later = new Date(SEEN.getTime() + 60_000);

      await expect(service.shouldProcess(SOURCE, 'region', later, false)).resolves.toBe(true);
    });

    it('processes regardless of the marker when forced, without even reading it', async () => {
      await expect(service.shouldProcess(SOURCE, 'city', SEEN, true)).resolves.toBe(true);
      expect(findUnique).not.toHaveBeenCalled();
    });

    it('guards cities too — the legacy check covered only regions and provinces', async () => {
      findUnique.mockResolvedValue({ lastSeenAt: SEEN });

      await expect(service.shouldProcess(SOURCE, 'city', SEEN, false)).resolves.toBe(false);
      expect(findUnique).toHaveBeenCalledWith({
        where: { source_resource: { source: SOURCE, resource: 'city' } },
      });
    });
  });

  describe('markProcessed', () => {
    it('upserts the high-water mark on the (source, resource) key', async () => {
      await service.markProcessed(SOURCE, 'province', SEEN);

      expect(upsert).toHaveBeenCalledTimes(1);
      const [call] = upsert.mock.calls as [
        [{ where: unknown; update: { lastSeenAt: Date }; create: { source: string } }],
      ];
      expect(call[0].where).toEqual({
        source_resource: { source: SOURCE, resource: 'province' },
      });
      expect(call[0].update.lastSeenAt).toBe(SEEN);
      expect(call[0].create.source).toBe(SOURCE);
    });
  });
});
