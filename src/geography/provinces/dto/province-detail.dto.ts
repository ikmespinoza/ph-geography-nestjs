import { ApiProperty } from '@nestjs/swagger';
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
  @ApiProperty({
    description: 'ISO 3166-2 province code — the path identifier.',
    example: 'PH-AGN',
  })
  @Expose()
  readonly code: string;

  @ApiProperty({ example: 'Agusan del Norte' })
  @Expose()
  readonly name: string;

  @ApiProperty({
    name: 'alt_name',
    type: String,
    nullable: true,
    description: 'Former or local-variant name; `null` when the province has none.',
    example: null,
  })
  @Expose({ name: 'alt_name' })
  readonly altName: string | null;

  @ApiProperty({ name: 'name_tl', description: 'Tagalog name.', example: 'Hilagang Agusan' })
  @Expose({ name: 'name_tl' })
  readonly nameTl: string;

  @ApiProperty({
    type: () => RegionSummaryDto,
    description: 'The region this province belongs to.',
  })
  @Expose()
  @Type(() => RegionSummaryDto)
  readonly region: RegionSummaryDto;

  @ApiProperty({
    type: () => [CitySummaryDto],
    description:
      "The province's cities and municipalities, ordered by name, each with its classification.",
  })
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
