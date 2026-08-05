import { ApiProperty } from '@nestjs/swagger';
import { Exclude, Expose, Type } from 'class-transformer';

import { blankToNull } from '@/common/text/nullable.util';
import { RegionSummaryDto } from '@/geography/dto/region-summary.dto';
import type { Province, Region } from '@/generated/prisma/client';

/**
 * A province as it appears in `GET /api/v1/regions/{region}/provinces`.
 *
 * Carries its parent `region` but omits `cities` (OD-3) — drill into
 * `GET /api/v1/regions/{region}/provinces/{province}` for those. The region is passed
 * in rather than read off the row: the service anchors its query on the region, so
 * every item in a list shares one instance instead of a per-row join.
 *
 * The nested `region` is `RegionSummaryDto` — the same class the regions list returns,
 * so the shape of a region is identical wherever it appears (PHG-010).
 */
@Exclude()
export class ProvinceListItemDto {
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

  constructor(province: Province, region: Region) {
    this.code = province.code;
    this.name = province.name;
    this.altName = blankToNull(province.altName);
    this.nameTl = province.nameTl;
    this.region = new RegionSummaryDto(region);
  }
}
