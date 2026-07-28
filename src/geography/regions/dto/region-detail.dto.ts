import { Exclude, Expose, Type } from 'class-transformer';

import { RegionProvinceDto } from '@/geography/regions/dto/region-province.dto';
import type { Province, Region } from '@/generated/prisma/client';

/**
 * A region as it appears in `GET /api/v1/regions/{code}` — the list shape plus one
 * level of nested provinces (OD-3), matching the payload documented in the legacy
 * README. Kept independent of `RegionListItemDto` so the two shapes can diverge in
 * PHG-010 without one silently dragging the other along.
 */
@Exclude()
export class RegionDetailDto {
  @Expose()
  readonly code: string;

  @Expose()
  readonly name: string;

  @Expose({ name: 'name_tl' })
  readonly nameTl: string;

  @Expose()
  readonly acronym: string;

  @Expose()
  @Type(() => RegionProvinceDto)
  readonly provinces: RegionProvinceDto[];

  constructor(region: Region & { provinces: Province[] }) {
    this.code = region.code;
    this.name = region.name;
    this.nameTl = region.nameTl;
    this.acronym = region.acronym;
    this.provinces = region.provinces.map((province) => new RegionProvinceDto(province));
  }
}
