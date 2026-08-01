import { Exclude, Expose, Type } from 'class-transformer';

import { ProvinceCityDto } from '@/geography/provinces/dto/province-city.dto';
import { ProvinceRegionDto } from '@/geography/provinces/dto/province-region.dto';
import type { City, Classification, Province, Region } from '@/generated/prisma/client';

/**
 * A province as it appears in `GET /api/v1/regions/{region}/provinces/{province}` —
 * the list shape plus one level of nested `cities` (OD-3), matching the payload
 * documented in the legacy README. Kept independent of `ProvinceListItemDto` so the
 * two shapes can diverge in PHG-010 without one silently dragging the other along.
 */
@Exclude()
export class ProvinceDetailDto {
  @Expose()
  readonly code: string;

  @Expose()
  readonly name: string;

  @Expose({ name: 'alt_name' })
  readonly altName: string | null;

  @Expose({ name: 'name_tl' })
  readonly nameTl: string;

  @Expose()
  @Type(() => ProvinceRegionDto)
  readonly region: ProvinceRegionDto;

  @Expose()
  @Type(() => ProvinceCityDto)
  readonly cities: ProvinceCityDto[];

  constructor(
    province: Province & { cities: (City & { classification: Classification })[] },
    region: Region,
  ) {
    this.code = province.code;
    this.name = province.name;
    this.altName = province.altName;
    this.nameTl = province.nameTl;
    this.region = new ProvinceRegionDto(region);
    this.cities = province.cities.map((city) => new ProvinceCityDto(city));
  }
}
