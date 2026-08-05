import { instanceToPlain } from 'class-transformer';

import { ResourceNotFoundException } from '@/common/http/resource-not-found.exception';
import { CitiesService } from '@/geography/cities/cities.service';
import { CityDto } from '@/geography/cities/dto/city.dto';
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

const SURIGAO_DEL_SUR: Province = {
  id: 23,
  code: 'PH-SUR',
  name: 'Surigao del Sur',
  altName: null,
  nameTl: 'Timog Surigaw',
  regionId: CARAGA.id,
  ...TIMESTAMPS,
};

const CAGAYAN: Province = {
  id: 9,
  code: 'PH-CAG',
  name: 'Cagayan',
  altName: null,
  nameTl: 'Cagayan',
  regionId: 2,
  ...TIMESTAMPS,
};

const MUNICIPALITY: Classification = {
  id: 1,
  code: 'Mun',
  description: 'Municipality',
  ...TIMESTAMPS,
};

const COMPONENT_CITY: Classification = {
  id: 2,
  code: 'CC',
  description: 'Component City',
  ...TIMESTAMPS,
};

type CityWithClassification = City & { classification: Classification };

const BAROBO: CityWithClassification = {
  id: 201,
  name: 'Barobo',
  altName: null,
  fullName: 'Barobo',
  isCapital: false,
  provinceId: SURIGAO_DEL_SUR.id,
  classificationId: MUNICIPALITY.id,
  classification: MUNICIPALITY,
  ...TIMESTAMPS,
};

const BISLIG: CityWithClassification = {
  id: 202,
  name: 'Bislig',
  altName: null,
  fullName: 'Bislig City',
  isCapital: false,
  provinceId: SURIGAO_DEL_SUR.id,
  classificationId: COMPONENT_CITY.id,
  classification: COMPONENT_CITY,
  ...TIMESTAMPS,
};

const TANDAG: CityWithClassification = {
  id: 203,
  name: 'Tandag',
  altName: null,
  fullName: 'Tandag City',
  isCapital: true,
  provinceId: SURIGAO_DEL_SUR.id,
  classificationId: COMPONENT_CITY.id,
  classification: COMPONENT_CITY,
  ...TIMESTAMPS,
};

/** An accented name — its slug (`penablanca`) is not a substring of the name. */
const PENABLANCA: CityWithClassification = {
  id: 301,
  name: 'Peñablanca',
  altName: null,
  fullName: 'Peñablanca',
  isCapital: false,
  provinceId: CAGAYAN.id,
  classificationId: MUNICIPALITY.id,
  classification: MUNICIPALITY,
  ...TIMESTAMPS,
};

const SURIGAO_DEL_SUR_CITIES = [BAROBO, BISLIG, TANDAG];

/** The region row Prisma returns for a scoped read that matched the province. */
function regionWith(province: Province, cities: CityWithClassification[]): unknown {
  return { ...CARAGA, provinces: [{ ...province, cities }] };
}

function createService(): { service: CitiesService; findUnique: jest.Mock } {
  const findUnique = jest.fn();
  const prisma = { region: { findUnique } } as unknown as PrismaService;

  return { service: new CitiesService(prisma), findUnique };
}

describe('CitiesService', () => {
  describe('findAllByProvince', () => {
    it('anchors on the region, scopes the province and eager-loads cities by name', async () => {
      const { service, findUnique } = createService();
      findUnique.mockResolvedValue(regionWith(SURIGAO_DEL_SUR, []));

      await service.findAllByProvince('PH-13', 'PH-SUR');

      expect(findUnique).toHaveBeenCalledTimes(1);
      expect(findUnique).toHaveBeenCalledWith({
        where: { code: 'PH-13' },
        include: {
          provinces: {
            where: { code: 'PH-SUR' },
            include: {
              cities: { orderBy: { name: 'asc' }, include: { classification: true } },
            },
          },
        },
      });
    });

    it('maps every city to a DTO, preserving the database order', async () => {
      const { service, findUnique } = createService();
      findUnique.mockResolvedValue(regionWith(SURIGAO_DEL_SUR, SURIGAO_DEL_SUR_CITIES));

      const cities = await service.findAllByProvince('PH-13', 'PH-SUR');

      expect(cities).toHaveLength(3);
      expect(cities.every((city) => city instanceof CityDto)).toBe(true);
      expect(cities.map((city) => city.name)).toEqual(['Barobo', 'Bislig', 'Tandag']);
    });

    it('serializes each city with its classification and province, but no ids or timestamps', async () => {
      const { service, findUnique } = createService();
      findUnique.mockResolvedValue(regionWith(SURIGAO_DEL_SUR, [TANDAG]));

      const [city] = await service.findAllByProvince('PH-13', 'PH-SUR');

      expect(instanceToPlain(city)).toEqual({
        name: 'Tandag',
        slug: 'tandag',
        alt_name: null,
        full_name: 'Tandag City',
        is_capital: true,
        classification: { code: 'CC', description: 'Component City' },
        province: {
          code: 'PH-SUR',
          name: 'Surigao del Sur',
          alt_name: null,
          name_tl: 'Timog Surigaw',
        },
      });
    });

    it('returns an empty list for a province that exists but has no cities', async () => {
      const { service, findUnique } = createService();
      findUnique.mockResolvedValue(regionWith(SURIGAO_DEL_SUR, []));

      await expect(service.findAllByProvince('PH-13', 'PH-SUR')).resolves.toEqual([]);
    });

    it('throws a 404 naming the region when the region itself is unknown', async () => {
      const { service, findUnique } = createService();
      findUnique.mockResolvedValue(null);

      const failure = service.findAllByProvince('PH-99', 'PH-SUR');

      await expect(failure).rejects.toBeInstanceOf(ResourceNotFoundException);
      await expect(failure).rejects.toMatchObject({
        status: 404,
        message: "Region 'PH-99' was not found.",
      });
    });

    it('throws a 404 naming the province when it does not belong to that region', async () => {
      const { service, findUnique } = createService();
      // The region exists, but scoping the nested query by code matched nothing —
      // what a province filed under a different region looks like.
      findUnique.mockResolvedValue({ ...CARAGA, provinces: [] });

      const failure = service.findAllByProvince('PH-13', 'PH-CAG');

      await expect(failure).rejects.toBeInstanceOf(ResourceNotFoundException);
      await expect(failure).rejects.toMatchObject({
        status: 404,
        message: "Province 'PH-CAG' was not found.",
      });
    });
  });

  describe('findOne', () => {
    it('returns the city detail matching the documented payload', async () => {
      const { service, findUnique } = createService();
      findUnique.mockResolvedValue(regionWith(SURIGAO_DEL_SUR, SURIGAO_DEL_SUR_CITIES));

      const city = await service.findOne('PH-13', 'PH-SUR', 'bislig');

      expect(city).toBeInstanceOf(CityDto);
      expect(instanceToPlain(city)).toEqual({
        name: 'Bislig',
        slug: 'bislig',
        alt_name: null,
        full_name: 'Bislig City',
        is_capital: false,
        classification: { code: 'CC', description: 'Component City' },
        province: {
          code: 'PH-SUR',
          name: 'Surigao del Sur',
          alt_name: null,
          name_tl: 'Timog Surigaw',
        },
      });
    });

    it('carries a populated singular province — the OD-5 regression', async () => {
      const { service, findUnique } = createService();
      findUnique.mockResolvedValue(regionWith(SURIGAO_DEL_SUR, SURIGAO_DEL_SUR_CITIES));

      const city = await service.findOne('PH-13', 'PH-SUR', 'bislig');
      const payload = instanceToPlain(city);

      // Legacy CityResource read `$this->provinces`, a relation City never declared,
      // so this key came back empty. It must be the singular province, populated.
      expect(payload).toHaveProperty('province.code', 'PH-SUR');
      expect(payload).not.toHaveProperty('provinces');
      expect(Array.isArray(payload.province)).toBe(false);
    });

    it('reads the city through one query, resolving the slug in memory', async () => {
      const { service, findUnique } = createService();
      findUnique.mockResolvedValue(regionWith(SURIGAO_DEL_SUR, SURIGAO_DEL_SUR_CITIES));

      await service.findOne('PH-13', 'PH-SUR', 'tandag');

      expect(findUnique).toHaveBeenCalledTimes(1);
    });

    it('matches an accented name through its ASCII slug', async () => {
      const { service, findUnique } = createService();
      findUnique.mockResolvedValue({
        ...CARAGA,
        provinces: [{ ...CAGAYAN, cities: [PENABLANCA] }],
      });

      const city = await service.findOne('PH-02', 'PH-CAG', 'penablanca');

      expect(city.name).toBe('Peñablanca');
    });

    it('throws a 404 naming the slug when no city matches', async () => {
      const { service, findUnique } = createService();
      findUnique.mockResolvedValue(regionWith(SURIGAO_DEL_SUR, SURIGAO_DEL_SUR_CITIES));

      const failure = service.findOne('PH-13', 'PH-SUR', 'atlantis');

      await expect(failure).rejects.toBeInstanceOf(ResourceNotFoundException);
      await expect(failure).rejects.toMatchObject({
        status: 404,
        message: "City 'atlantis' was not found.",
      });
    });

    it('matches the slug exactly — the raw name is not a valid identifier', async () => {
      const { service, findUnique } = createService();
      findUnique.mockResolvedValue(regionWith(SURIGAO_DEL_SUR, SURIGAO_DEL_SUR_CITIES));

      await expect(service.findOne('PH-13', 'PH-SUR', 'Bislig')).rejects.toBeInstanceOf(
        ResourceNotFoundException,
      );
      await expect(service.findOne('PH-13', 'PH-SUR', 'BISLIG')).rejects.toBeInstanceOf(
        ResourceNotFoundException,
      );
    });

    it('throws a 404 naming the region when the region is unknown', async () => {
      const { service, findUnique } = createService();
      findUnique.mockResolvedValue(null);

      const failure = service.findOne('PH-99', 'PH-SUR', 'bislig');

      await expect(failure).rejects.toBeInstanceOf(ResourceNotFoundException);
      await expect(failure).rejects.toMatchObject({
        status: 404,
        message: "Region 'PH-99' was not found.",
      });
    });

    it('throws a 404 naming the province when it does not belong to that region', async () => {
      const { service, findUnique } = createService();
      findUnique.mockResolvedValue({ ...CARAGA, provinces: [] });

      const failure = service.findOne('PH-13', 'PH-CAG', 'penablanca');

      await expect(failure).rejects.toBeInstanceOf(ResourceNotFoundException);
      await expect(failure).rejects.toMatchObject({
        status: 404,
        message: "Province 'PH-CAG' was not found.",
      });
    });

    it('does not normalize the region or province code — matching is exact', async () => {
      const { service, findUnique } = createService();
      findUnique.mockResolvedValue(null);

      await expect(service.findOne('ph-13', 'ph-sur', 'bislig')).rejects.toBeInstanceOf(
        ResourceNotFoundException,
      );
      expect(findUnique).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { code: 'ph-13' },
          include: {
            provinces: expect.objectContaining({ where: { code: 'ph-sur' } }) as unknown,
          },
        }),
      );
    });
  });
});
