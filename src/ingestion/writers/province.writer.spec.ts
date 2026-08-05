import type { ProvinceRow } from '@/ingestion/scraper-core/geo-source';
import { NCR_DISTRICTS } from '@/ingestion/sources/iso3166/ncr-districts';
import { ProvinceWriter } from '@/ingestion/writers/province.writer';
import type { PrismaService } from '@/persistence/prisma.service';

const AGUSAN: ProvinceRow = {
  code: 'PH-AGN',
  name: 'Agusan del Norte',
  altName: null,
  nameTl: 'Hilagang Agusan',
  regionCode: 'PH-13',
};

describe('ProvinceWriter', () => {
  const regionFindMany = jest.fn();
  const regionFindUnique = jest.fn();
  const provinceFindMany = jest.fn();
  const provinceFindUnique = jest.fn();
  const create = jest.fn();
  const update = jest.fn();

  const prisma = {
    region: { findMany: regionFindMany, findUnique: regionFindUnique },
    province: { findMany: provinceFindMany, findUnique: provinceFindUnique, create, update },
  } as unknown as PrismaService;
  const writer = new ProvinceWriter(prisma);

  beforeEach(() => {
    jest.resetAllMocks();
    regionFindMany.mockResolvedValue([{ id: 13, code: 'PH-13' }]);
    provinceFindMany.mockResolvedValue([]);
  });

  describe('write', () => {
    it('resolves the region and creates the province', async () => {
      await expect(writer.write([AGUSAN])).resolves.toMatchObject({ created: 1, rejected: 0 });
      expect(create).toHaveBeenCalledWith({
        data: {
          code: 'PH-AGN',
          name: 'Agusan del Norte',
          altName: null,
          nameTl: 'Hilagang Agusan',
          regionId: 13,
        },
      });
    });

    it('rejects and counts a province whose region is unknown, without aborting', async () => {
      const orphan: ProvinceRow = { ...AGUSAN, code: 'PH-XXX', regionCode: 'PH-99' };

      await expect(writer.write([orphan, AGUSAN])).resolves.toMatchObject({
        created: 1,
        rejected: 1,
      });
      expect(create).toHaveBeenCalledTimes(1);
    });

    it('collapses a blank alt_name to null', async () => {
      await writer.write([{ ...AGUSAN, altName: '  ' }]);

      expect(create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ altName: null }) as unknown }),
      );
    });

    it('leaves an identical province untouched', async () => {
      provinceFindMany.mockResolvedValue([
        {
          code: 'PH-AGN',
          name: 'Agusan del Norte',
          altName: null,
          nameTl: 'Hilagang Agusan',
          regionId: 13,
        },
      ]);

      await expect(writer.write([AGUSAN])).resolves.toMatchObject({ unchanged: 1 });
      expect(create).not.toHaveBeenCalled();
      expect(update).not.toHaveBeenCalled();
    });

    it('updates a province that moved region', async () => {
      regionFindMany.mockResolvedValue([
        { id: 13, code: 'PH-13' },
        { id: 99, code: 'PH-99' },
      ]);
      provinceFindMany.mockResolvedValue([
        {
          code: 'PH-AGN',
          name: 'Agusan del Norte',
          altName: null,
          nameTl: 'Hilagang Agusan',
          regionId: 99,
        },
      ]);

      await expect(writer.write([AGUSAN])).resolves.toMatchObject({ updated: 1 });
      expect(update).toHaveBeenCalledWith({
        where: { code: 'PH-AGN' },
        data: expect.objectContaining({ regionId: 13 }) as unknown,
      });
    });
  });

  describe('ensureNcrDistricts', () => {
    it('creates all four districts under the scraped PH-00 region', async () => {
      regionFindUnique.mockResolvedValue({ id: 7 });
      provinceFindUnique.mockResolvedValue(null);

      await expect(writer.ensureNcrDistricts()).resolves.toMatchObject({ created: 4, rejected: 0 });
      expect(create).toHaveBeenCalledTimes(4);
      expect(create).toHaveBeenCalledWith({
        data: {
          code: 'PH-00-D1',
          name: 'Capital District',
          altName: 'City of Manila',
          nameTl: 'Distrito ng Kabisera',
          regionId: 7,
        },
      });
    });

    it('is idempotent — a second run writes nothing', async () => {
      regionFindUnique.mockResolvedValue({ id: 7 });
      provinceFindUnique.mockImplementation(({ where }: { where: { code: string } }) => {
        const district = NCR_DISTRICTS.find((candidate) => candidate.code === where.code);
        return Promise.resolve(
          district === undefined
            ? null
            : {
                name: district.name,
                altName: district.altName,
                nameTl: district.nameTl,
                regionId: 7,
              },
        );
      });

      await expect(writer.ensureNcrDistricts()).resolves.toMatchObject({
        created: 0,
        updated: 0,
        unchanged: 4,
      });
      expect(create).not.toHaveBeenCalled();
      expect(update).not.toHaveBeenCalled();
    });

    it('warns and writes nothing when PH-00 has not been scraped yet', async () => {
      regionFindUnique.mockResolvedValue(null);

      await expect(writer.ensureNcrDistricts()).resolves.toMatchObject({
        created: 0,
        rejected: 4,
      });
      expect(create).not.toHaveBeenCalled();
    });
  });
});
