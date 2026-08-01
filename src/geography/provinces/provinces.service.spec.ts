import { instanceToPlain } from 'class-transformer';

import { ResourceNotFoundException } from '@/common/http/resource-not-found.exception';
import { ProvinceDetailDto } from '@/geography/provinces/dto/province-detail.dto';
import { ProvinceListItemDto } from '@/geography/provinces/dto/province-list-item.dto';
import { ProvincesService } from '@/geography/provinces/provinces.service';
import type { City, Classification, Province, Region } from '@/generated/prisma/client';
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

const MUNICIPALITY: Classification = {
  id: 1,
  code: 'Mun',
  description: 'Municipality',
  ...TIMESTAMPS,
};

const HIGHLY_URBANIZED_CITY: Classification = {
  id: 4,
  code: 'HUC',
  description: 'Highly Urbanized City',
  ...TIMESTAMPS,
};

const BUENAVISTA: City & { classification: Classification } = {
  id: 101,
  name: 'Buenavista',
  altName: null,
  fullName: 'Buenavista',
  isCapital: false,
  provinceId: AGUSAN_DEL_NORTE.id,
  classificationId: MUNICIPALITY.id,
  classification: MUNICIPALITY,
  ...TIMESTAMPS,
};

const BUTUAN: City & { classification: Classification } = {
  id: 102,
  name: 'Butuan',
  altName: null,
  fullName: 'Butuan City',
  isCapital: false,
  provinceId: AGUSAN_DEL_NORTE.id,
  classificationId: HIGHLY_URBANIZED_CITY.id,
  classification: HIGHLY_URBANIZED_CITY,
  ...TIMESTAMPS,
};

function createService(): { service: ProvincesService; findUnique: jest.Mock } {
  const findUnique = jest.fn();
  const prisma = { region: { findUnique } } as unknown as PrismaService;

  return { service: new ProvincesService(prisma), findUnique };
}

describe('ProvincesService', () => {
  describe('findAllByRegion', () => {
    it('anchors on the region code and eager-loads its provinces ordered by name', async () => {
      const { service, findUnique } = createService();
      findUnique.mockResolvedValue({ ...CARAGA, provinces: [] });

      await service.findAllByRegion('PH-13');

      expect(findUnique).toHaveBeenCalledWith({
        where: { code: 'PH-13' },
        include: { provinces: { orderBy: { name: 'asc' } } },
      });
    });

    it('maps every province to a list DTO, preserving the database order', async () => {
      const { service, findUnique } = createService();
      findUnique.mockResolvedValue({
        ...CARAGA,
        provinces: [AGUSAN_DEL_NORTE, DINAGAT_ISLANDS],
      });

      const provinces = await service.findAllByRegion('PH-13');

      expect(provinces).toHaveLength(2);
      expect(provinces.every((province) => province instanceof ProvinceListItemDto)).toBe(true);
      expect(provinces.map((province) => province.code)).toEqual(['PH-AGN', 'PH-DIN']);
    });

    it('serializes each list item with its region but without cities, ids or timestamps', async () => {
      const { service, findUnique } = createService();
      findUnique.mockResolvedValue({ ...CARAGA, provinces: [DINAGAT_ISLANDS] });

      const [province] = await service.findAllByRegion('PH-13');

      expect(instanceToPlain(province)).toEqual({
        code: 'PH-DIN',
        name: 'Dinagat Islands',
        alt_name: 'Dinagat',
        name_tl: 'Pulo ng Dinagat',
        region: {
          code: 'PH-13',
          name: 'Caraga',
          name_tl: 'Rehiyon ng Karaga',
          acronym: 'XIII',
        },
      });
    });

    it('returns an empty list for a region that exists but has no provinces', async () => {
      const { service, findUnique } = createService();
      findUnique.mockResolvedValue({ ...CARAGA, provinces: [] });

      await expect(service.findAllByRegion('PH-13')).resolves.toEqual([]);
    });

    it('throws a 404 naming the region when the region itself is unknown', async () => {
      const { service, findUnique } = createService();
      findUnique.mockResolvedValue(null);

      const failure = service.findAllByRegion('PH-99');

      await expect(failure).rejects.toBeInstanceOf(ResourceNotFoundException);
      await expect(failure).rejects.toMatchObject({
        status: 404,
        message: "Region 'PH-99' was not found.",
      });
    });
  });

  describe('findOne', () => {
    it('scopes the province to the region and eager-loads its cities with classifications', async () => {
      const { service, findUnique } = createService();
      findUnique.mockResolvedValue({
        ...CARAGA,
        provinces: [{ ...AGUSAN_DEL_NORTE, cities: [] }],
      });

      await service.findOne('PH-13', 'PH-AGN');

      expect(findUnique).toHaveBeenCalledWith({
        where: { code: 'PH-13' },
        include: {
          provinces: {
            where: { code: 'PH-AGN' },
            include: {
              cities: { orderBy: { name: 'asc' }, include: { classification: true } },
            },
          },
        },
      });
    });

    it('returns the detail DTO matching the documented payload', async () => {
      const { service, findUnique } = createService();
      findUnique.mockResolvedValue({
        ...CARAGA,
        provinces: [{ ...AGUSAN_DEL_NORTE, cities: [BUENAVISTA, BUTUAN] }],
      });

      const province = await service.findOne('PH-13', 'PH-AGN');

      expect(province).toBeInstanceOf(ProvinceDetailDto);
      expect(instanceToPlain(province)).toEqual({
        code: 'PH-AGN',
        name: 'Agusan del Norte',
        alt_name: null,
        name_tl: 'Hilagang Agusan',
        region: {
          code: 'PH-13',
          name: 'Caraga',
          name_tl: 'Rehiyon ng Karaga',
          acronym: 'XIII',
        },
        cities: [
          {
            name: 'Buenavista',
            alt_name: null,
            full_name: 'Buenavista',
            is_capital: false,
            classification: { code: 'Mun', description: 'Municipality' },
          },
          {
            name: 'Butuan',
            alt_name: null,
            full_name: 'Butuan City',
            is_capital: false,
            classification: { code: 'HUC', description: 'Highly Urbanized City' },
          },
        ],
      });
    });

    it('serializes a city-less province as an empty array, not a missing key', async () => {
      const { service, findUnique } = createService();
      findUnique.mockResolvedValue({
        ...CARAGA,
        provinces: [{ ...DINAGAT_ISLANDS, cities: [] }],
      });

      const province = await service.findOne('PH-13', 'PH-DIN');

      expect(instanceToPlain(province)).toMatchObject({ cities: [] });
    });

    it('throws a 404 naming the region when the region is unknown', async () => {
      const { service, findUnique } = createService();
      findUnique.mockResolvedValue(null);

      const failure = service.findOne('PH-99', 'PH-AGN');

      await expect(failure).rejects.toBeInstanceOf(ResourceNotFoundException);
      await expect(failure).rejects.toMatchObject({
        status: 404,
        message: "Region 'PH-99' was not found.",
      });
    });

    it('throws a 404 naming the province when it does not belong to that region', async () => {
      const { service, findUnique } = createService();
      // The region exists, but scoping the nested query by code matched nothing —
      // exactly what a province filed under a different region looks like.
      findUnique.mockResolvedValue({ ...CARAGA, provinces: [] });

      const failure = service.findOne('PH-13', 'PH-ABR');

      await expect(failure).rejects.toBeInstanceOf(ResourceNotFoundException);
      await expect(failure).rejects.toMatchObject({
        status: 404,
        message: "Province 'PH-ABR' was not found.",
      });
    });

    it('does not normalize either code — matching is exact', async () => {
      const { service, findUnique } = createService();
      findUnique.mockResolvedValue(null);

      await expect(service.findOne('ph-13', 'ph-agn')).rejects.toBeInstanceOf(
        ResourceNotFoundException,
      );
      expect(findUnique).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { code: 'ph-13' },
          include: {
            provinces: expect.objectContaining({ where: { code: 'ph-agn' } }) as unknown,
          },
        }),
      );
    });
  });
});
