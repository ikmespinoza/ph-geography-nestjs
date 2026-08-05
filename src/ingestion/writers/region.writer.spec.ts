import type { RegionRow } from '@/ingestion/scraper-core/geo-source';
import { RegionWriter } from '@/ingestion/writers/region.writer';
import type { PrismaService } from '@/persistence/prisma.service';

const CARAGA: RegionRow = {
  code: 'PH-13',
  name: 'Caraga',
  nameTl: 'Rehiyon ng Karaga',
  acronym: 'XIII',
};

describe('RegionWriter', () => {
  const findMany = jest.fn();
  const create = jest.fn();
  const update = jest.fn();
  const prisma = { region: { findMany, create, update } } as unknown as PrismaService;
  const writer = new RegionWriter(prisma);

  beforeEach(() => {
    findMany.mockReset();
    create.mockReset();
    update.mockReset();
  });

  it('creates a region that is not in the database yet', async () => {
    findMany.mockResolvedValue([]);

    await expect(writer.write([CARAGA])).resolves.toEqual({
      created: 1,
      updated: 0,
      unchanged: 0,
      rejected: 0,
    });
    expect(create).toHaveBeenCalledWith({ data: CARAGA });
    expect(update).not.toHaveBeenCalled();
  });

  it('writes nothing when the row is identical — the idempotency guarantee', async () => {
    findMany.mockResolvedValue([CARAGA]);

    await expect(writer.write([CARAGA])).resolves.toMatchObject({ unchanged: 1, updated: 0 });
    expect(create).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });

  it('updates a renamed region instead of ignoring it, as the legacy did', async () => {
    findMany.mockResolvedValue([{ ...CARAGA, name: 'Karaga' }]);

    await expect(writer.write([CARAGA])).resolves.toMatchObject({ updated: 1, unchanged: 0 });
    expect(update).toHaveBeenCalledWith({
      where: { code: 'PH-13' },
      data: { name: 'Caraga', nameTl: 'Rehiyon ng Karaga', acronym: 'XIII' },
    });
  });

  it('keys on code, so an acronym change is an update rather than a second row', async () => {
    findMany.mockResolvedValue([{ ...CARAGA, acronym: 'XII' }]);

    await writer.write([CARAGA]);

    expect(create).not.toHaveBeenCalled();
    expect(update).toHaveBeenCalledTimes(1);
  });

  it('reads the existing rows once, not once per row', async () => {
    findMany.mockResolvedValue([]);

    await writer.write([CARAGA, { ...CARAGA, code: 'PH-05', name: 'Bicol' }]);

    expect(findMany).toHaveBeenCalledTimes(1);
    expect(create).toHaveBeenCalledTimes(2);
  });
});
