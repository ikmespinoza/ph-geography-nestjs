import { instanceToPlain } from 'class-transformer';

import { ResourceNotFoundException } from '@/common/http/resource-not-found.exception';
import { RegionDetailDto } from '@/geography/regions/dto/region-detail.dto';
import { RegionSummaryDto } from '@/geography/dto/region-summary.dto';
import { RegionsService } from '@/geography/regions/regions.service';
import type { Province, Region } from '@/generated/prisma/client';
import type { PrismaService } from '@/persistence/prisma.service';

const TIMESTAMPS = {
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-02T00:00:00.000Z'),
};

const CARAGA: Region = {
  id: 7,
  code: 'PH-13',
  name: 'Caraga',
  nameTl: 'Rehiyon ng Karaga',
  acronym: 'XIII',
  ...TIMESTAMPS,
};

const BICOL: Region = {
  id: 3,
  code: 'PH-05',
  name: 'Bicol Region',
  nameTl: 'Kabikulan',
  acronym: 'V',
  ...TIMESTAMPS,
};

const AGUSAN_DEL_NORTE: Province = {
  id: 21,
  code: 'PH-AGN',
  name: 'Agusan del Norte',
  altName: null,
  nameTl: 'Hilagang Agusan',
  regionId: CARAGA.id,
  ...TIMESTAMPS,
};

const DINAGAT_ISLANDS: Province = {
  id: 22,
  code: 'PH-DIN',
  name: 'Dinagat Islands',
  altName: 'Dinagat',
  nameTl: 'Pulo ng Dinagat',
  regionId: CARAGA.id,
  ...TIMESTAMPS,
};

function createService(): {
  service: RegionsService;
  findMany: jest.Mock;
  findUnique: jest.Mock;
} {
  const findMany = jest.fn();
  const findUnique = jest.fn();
  const prisma = { region: { findMany, findUnique } } as unknown as PrismaService;

  return { service: new RegionsService(prisma), findMany, findUnique };
}

describe('RegionsService', () => {
  describe('findAll', () => {
    it('asks the database for regions ordered by name', async () => {
      const { service, findMany } = createService();
      findMany.mockResolvedValue([BICOL, CARAGA]);

      await service.findAll();

      expect(findMany).toHaveBeenCalledWith({ orderBy: { name: 'asc' } });
    });

    it('maps every row to a list DTO, preserving the database order', async () => {
      const { service, findMany } = createService();
      findMany.mockResolvedValue([BICOL, CARAGA]);

      const regions = await service.findAll();

      expect(regions).toHaveLength(2);
      expect(regions.every((region) => region instanceof RegionSummaryDto)).toBe(true);
      expect(regions.map((region) => region.code)).toEqual(['PH-05', 'PH-13']);
    });

    it('serializes list items without provinces, ids or timestamps', async () => {
      const { service, findMany } = createService();
      findMany.mockResolvedValue([CARAGA]);

      const [region] = await service.findAll();

      expect(instanceToPlain(region)).toEqual({
        code: 'PH-13',
        name: 'Caraga',
        name_tl: 'Rehiyon ng Karaga',
        acronym: 'XIII',
      });
    });

    it('returns an empty list when there are no regions', async () => {
      const { service, findMany } = createService();
      findMany.mockResolvedValue([]);

      await expect(service.findAll()).resolves.toEqual([]);
    });
  });

  describe('findOne', () => {
    it('looks the region up by ISO code and eager-loads its provinces ordered by name', async () => {
      const { service, findUnique } = createService();
      findUnique.mockResolvedValue({ ...CARAGA, provinces: [] });

      await service.findOne('PH-13');

      expect(findUnique).toHaveBeenCalledWith({
        where: { code: 'PH-13' },
        include: { provinces: { orderBy: { name: 'asc' } } },
      });
    });

    it('returns the detail DTO with shallow nested provinces', async () => {
      const { service, findUnique } = createService();
      findUnique.mockResolvedValue({
        ...CARAGA,
        provinces: [AGUSAN_DEL_NORTE, DINAGAT_ISLANDS],
      });

      const region = await service.findOne('PH-13');

      expect(region).toBeInstanceOf(RegionDetailDto);
      expect(instanceToPlain(region)).toEqual({
        code: 'PH-13',
        name: 'Caraga',
        name_tl: 'Rehiyon ng Karaga',
        acronym: 'XIII',
        provinces: [
          {
            code: 'PH-AGN',
            name: 'Agusan del Norte',
            alt_name: null,
            name_tl: 'Hilagang Agusan',
          },
          {
            code: 'PH-DIN',
            name: 'Dinagat Islands',
            alt_name: 'Dinagat',
            name_tl: 'Pulo ng Dinagat',
          },
        ],
      });
    });

    it('serializes a region with no provinces as an empty array, not a missing key', async () => {
      const { service, findUnique } = createService();
      findUnique.mockResolvedValue({ ...BICOL, provinces: [] });

      const region = await service.findOne('PH-05');

      expect(instanceToPlain(region)).toMatchObject({ provinces: [] });
    });

    it('throws a 404 naming the code that missed — never a 200 error body', async () => {
      const { service, findUnique } = createService();
      findUnique.mockResolvedValue(null);

      const failure = service.findOne('PH-99');

      await expect(failure).rejects.toBeInstanceOf(ResourceNotFoundException);
      await expect(failure).rejects.toMatchObject({
        status: 404,
        message: "Region 'PH-99' was not found.",
      });
    });

    it('does not normalize the code — matching is exact', async () => {
      const { service, findUnique } = createService();
      findUnique.mockResolvedValue(null);

      await expect(service.findOne('ph-13')).rejects.toBeInstanceOf(ResourceNotFoundException);
      expect(findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { code: 'ph-13' } }),
      );
    });
  });
});
