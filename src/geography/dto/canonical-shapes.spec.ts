// The only spec that exercises decorated classes without booting Nest, which is what
// normally pulls the metadata polyfill in.
import 'reflect-metadata';

import { instanceToPlain } from 'class-transformer';

import { CityDto } from '@/geography/cities/dto/city.dto';
import { CitySummaryDto } from '@/geography/dto/city-summary.dto';
import { ClassificationDto } from '@/geography/dto/classification.dto';
import { ProvinceSummaryDto } from '@/geography/dto/province-summary.dto';
import { RegionSummaryDto } from '@/geography/dto/region-summary.dto';
import { ProvinceDetailDto } from '@/geography/provinces/dto/province-detail.dto';
import { ProvinceListItemDto } from '@/geography/provinces/dto/province-list-item.dto';
import { RegionDetailDto } from '@/geography/regions/dto/region-detail.dto';
import type { City, Classification, Province, Region } from '@/generated/prisma/client';

/**
 * PHG-010 — the canonical shapes, guarded at the class level.
 *
 * `serialization.e2e-spec.ts` pins what each endpoint returns; this suite pins the
 * relationships *between* the DTO classes, so drift is caught the moment a field is
 * added to one of an overlapping pair rather than only when someone reads a snapshot
 * diff. Two kinds of guarantee:
 *
 *  - **Nested identity** — a bare region/province/city/classification is one class,
 *    so every nesting of it is the same object by construction. Asserted here because
 *    "we merged the classes" is only true until someone un-merges them.
 *  - **Overlap** — a detail DTO re-declares its own entity's scalar fields rather than
 *    inheriting them (the precedent PHG-007/008 set, kept deliberately). These cases
 *    are what make that duplication safe.
 */

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

/** Both nullable fields populated — the only fixture that proves they can be strings. */
const DAVAO_DE_ORO: Province = {
  id: 24,
  code: 'PH-COM',
  name: 'Davao de Oro',
  altName: 'Compostela Valley',
  nameTl: 'Davao de Oro',
  regionId: CARAGA.id,
  ...TIMESTAMPS,
};

const COMPONENT_CITY: Classification = {
  id: 2,
  code: 'CC',
  description: 'Component City',
  ...TIMESTAMPS,
};

const BISLIG: City & { classification: Classification } = {
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

/** A former name plus an accented character — the non-null and non-ASCII paths. */
const PENABLANCA: City & { classification: Classification } = {
  id: 210,
  name: 'Peñablanca',
  altName: 'Peñablanca Poblacion',
  fullName: 'Peñablanca',
  isCapital: false,
  provinceId: SURIGAO_DEL_SUR.id,
  classificationId: COMPONENT_CITY.id,
  classification: COMPONENT_CITY,
  ...TIMESTAMPS,
};

const keysOf = (dto: object): string[] => Object.keys(instanceToPlain(dto)).sort();

describe('canonical geography shapes', () => {
  describe('the region shape is one class', () => {
    it('serves the regions list and the region nested in a province identically', () => {
      const listed = new RegionSummaryDto(CARAGA);
      const nested = new ProvinceListItemDto(SURIGAO_DEL_SUR, CARAGA).region;

      expect(nested).toBeInstanceOf(RegionSummaryDto);
      expect(instanceToPlain(nested)).toEqual(instanceToPlain(listed));
    });

    it('nests the same region in a province list item and a province detail', () => {
      const listItem = new ProvinceListItemDto(SURIGAO_DEL_SUR, CARAGA);
      const detail = new ProvinceDetailDto({ ...SURIGAO_DEL_SUR, cities: [] }, CARAGA);

      expect(instanceToPlain(detail.region)).toEqual(instanceToPlain(listItem.region));
    });

    it('exposes exactly code, name, name_tl and acronym', () => {
      expect(keysOf(new RegionSummaryDto(CARAGA))).toEqual(['acronym', 'code', 'name', 'name_tl']);
    });
  });

  describe('the province shape is one class', () => {
    it('serves the province in a region detail and the province in a city identically', () => {
      const inRegion = new RegionDetailDto({ ...CARAGA, provinces: [SURIGAO_DEL_SUR] })
        .provinces[0];
      const inCity = new CityDto(BISLIG, SURIGAO_DEL_SUR).province;

      expect(inRegion).toBeInstanceOf(ProvinceSummaryDto);
      expect(inCity).toBeInstanceOf(ProvinceSummaryDto);
      expect(instanceToPlain(inCity)).toEqual(instanceToPlain(inRegion));
    });

    it('exposes exactly code, name, alt_name and name_tl', () => {
      expect(keysOf(new ProvinceSummaryDto(SURIGAO_DEL_SUR))).toEqual([
        'alt_name',
        'code',
        'name',
        'name_tl',
      ]);
    });

    it('keeps alt_name present as null rather than omitting it', () => {
      const payload = instanceToPlain(new ProvinceSummaryDto(SURIGAO_DEL_SUR));

      expect(payload).toHaveProperty('alt_name');
      expect(payload.alt_name).toBeNull();
    });

    it('passes a former name through unchanged', () => {
      expect(instanceToPlain(new ProvinceSummaryDto(DAVAO_DE_ORO)).alt_name).toBe(
        'Compostela Valley',
      );
    });

    it('reports a blank column as null, so alt_name is never an empty string', () => {
      const blank = new ProvinceSummaryDto({ ...SURIGAO_DEL_SUR, altName: '' });
      const whitespace = new ProvinceSummaryDto({ ...SURIGAO_DEL_SUR, altName: '  ' });

      expect(instanceToPlain(blank).alt_name).toBeNull();
      expect(instanceToPlain(whitespace).alt_name).toBeNull();
    });
  });

  describe('the city shape is one class plus a back-reference', () => {
    it('differs from the full city payload by the province key alone', () => {
      const summaryKeys = keysOf(new CitySummaryDto(BISLIG));
      const cityKeys = keysOf(new CityDto(BISLIG, SURIGAO_DEL_SUR));

      expect(cityKeys).toEqual([...summaryKeys, 'province'].sort());
    });

    it('serializes every shared field identically in both', () => {
      const summary = instanceToPlain(new CitySummaryDto(BISLIG));
      const full = instanceToPlain(new CityDto(BISLIG, SURIGAO_DEL_SUR));

      expect(full).toMatchObject(summary);
    });

    it('exposes exactly name, slug, alt_name, full_name, is_capital and classification', () => {
      expect(keysOf(new CitySummaryDto(BISLIG))).toEqual([
        'alt_name',
        'classification',
        'full_name',
        'is_capital',
        'name',
        'slug',
      ]);
    });

    it('keeps alt_name present as null, and passes a former name through', () => {
      const withoutAlt = instanceToPlain(new CitySummaryDto(BISLIG));
      const withAlt = instanceToPlain(new CitySummaryDto(PENABLANCA));

      expect(withoutAlt).toHaveProperty('alt_name');
      expect(withoutAlt.alt_name).toBeNull();
      expect(withAlt.alt_name).toBe('Peñablanca Poblacion');
    });

    it('reports a blank column as null, so alt_name is never an empty string', () => {
      expect(instanceToPlain(new CitySummaryDto({ ...BISLIG, altName: '' })).alt_name).toBeNull();
      expect(
        instanceToPlain(new CityDto({ ...BISLIG, altName: '  ' }, SURIGAO_DEL_SUR)).alt_name,
      ).toBeNull();
    });

    it('serializes is_capital as a real boolean, both ways', () => {
      const capital = new CitySummaryDto({ ...BISLIG, isCapital: true });

      expect(instanceToPlain(capital).is_capital).toBe(true);
      expect(instanceToPlain(new CitySummaryDto(BISLIG)).is_capital).toBe(false);
    });

    it('derives slug from name, stripping accents (OD-15)', () => {
      expect(instanceToPlain(new CitySummaryDto(PENABLANCA)).slug).toBe('penablanca');
      expect(instanceToPlain(new CityDto(PENABLANCA, SURIGAO_DEL_SUR)).slug).toBe('penablanca');
    });
  });

  describe('the classification shape is one class', () => {
    it('serves the classification of a nested city and a standalone city identically', () => {
      const nested = new CitySummaryDto(BISLIG).classification;
      const standalone = new CityDto(BISLIG, SURIGAO_DEL_SUR).classification;

      expect(nested).toBeInstanceOf(ClassificationDto);
      expect(standalone).toBeInstanceOf(ClassificationDto);
      expect(instanceToPlain(standalone)).toEqual(instanceToPlain(nested));
    });

    it('exposes exactly code and description', () => {
      expect(keysOf(new ClassificationDto(COMPONENT_CITY))).toEqual(['code', 'description']);
    });
  });

  describe('detail DTOs have not drifted from the summary they overlap', () => {
    it('region detail carries the region summary fields plus provinces', () => {
      const summaryKeys = keysOf(new RegionSummaryDto(CARAGA));
      const detailKeys = keysOf(new RegionDetailDto({ ...CARAGA, provinces: [] }));

      expect(detailKeys).toEqual([...summaryKeys, 'provinces'].sort());
    });

    it('province list item carries the province summary fields plus region', () => {
      const summaryKeys = keysOf(new ProvinceSummaryDto(SURIGAO_DEL_SUR));
      const listKeys = keysOf(new ProvinceListItemDto(SURIGAO_DEL_SUR, CARAGA));

      expect(listKeys).toEqual([...summaryKeys, 'region'].sort());
    });

    it('province detail carries the list-item fields plus cities', () => {
      const listKeys = keysOf(new ProvinceListItemDto(SURIGAO_DEL_SUR, CARAGA));
      const detailKeys = keysOf(new ProvinceDetailDto({ ...SURIGAO_DEL_SUR, cities: [] }, CARAGA));

      expect(detailKeys).toEqual([...listKeys, 'cities'].sort());
    });
  });

  describe('no DTO lets an internal column through', () => {
    const internal = [
      'id',
      'regionId',
      'region_id',
      'provinceId',
      'province_id',
      'classificationId',
      'classification_id',
      'createdAt',
      'created_at',
      'updatedAt',
      'updated_at',
    ];

    const shapes: [string, object][] = [
      ['RegionSummaryDto', new RegionSummaryDto(CARAGA)],
      ['RegionDetailDto', new RegionDetailDto({ ...CARAGA, provinces: [SURIGAO_DEL_SUR] })],
      ['ProvinceSummaryDto', new ProvinceSummaryDto(SURIGAO_DEL_SUR)],
      ['ProvinceListItemDto', new ProvinceListItemDto(SURIGAO_DEL_SUR, CARAGA)],
      [
        'ProvinceDetailDto',
        new ProvinceDetailDto({ ...SURIGAO_DEL_SUR, cities: [BISLIG] }, CARAGA),
      ],
      ['CitySummaryDto', new CitySummaryDto(BISLIG)],
      ['CityDto', new CityDto(BISLIG, SURIGAO_DEL_SUR)],
      ['ClassificationDto', new ClassificationDto(COMPONENT_CITY)],
    ];

    it.each(shapes)('%s', (_name, dto) => {
      const serialized = JSON.stringify(instanceToPlain(dto));

      for (const key of internal) {
        expect(serialized).not.toContain(`"${key}"`);
      }
    });
  });
});
