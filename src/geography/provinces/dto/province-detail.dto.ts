import { Exclude, Expose, Type } from 'class-transformer';

import { blankToNull } from '@/common/text/nullable.util';
import { CitySummaryDto } from '@/geography/dto/city-summary.dto';
import { RegionSummaryDto } from '@/geography/dto/region-summary.dto';
import type { City, Classification, Province, Region } from '@/generated/prisma/client';

/**
 * A province as it appears in `GET /api/v1/regions/{region}/provinces/{province}` —
 * the list shape plus one level of nested `cities` (OD-3), matching the payload
 * documented in the legacy README.
 *
 * Both nestings are canonical shapes (PHG-010): `region` is the same
 * `RegionSummaryDto` the regions list returns, and each city is the same
 * `CitySummaryDto` that `CityDto` adds a `province` back-reference to — so the only
 * difference between a city here and a city on its own endpoint is that one field.
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
  @Type(() => RegionSummaryDto)
  readonly region: RegionSummaryDto;

  @Expose()
  @Type(() => CitySummaryDto)
  readonly cities: CitySummaryDto[];

  constructor(
    province: Province & { cities: (City & { classification: Classification })[] },
    region: Region,
  ) {
    this.code = province.code;
    this.name = province.name;
    this.altName = blankToNull(province.altName);
    this.nameTl = province.nameTl;
    this.region = new RegionSummaryDto(region);
    this.cities = province.cities.map((city) => new CitySummaryDto(city));
  }
}
