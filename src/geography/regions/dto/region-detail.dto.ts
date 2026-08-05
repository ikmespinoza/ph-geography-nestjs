import { ApiProperty } from '@nestjs/swagger';
import { Exclude, Expose, Type } from 'class-transformer';

import { ProvinceSummaryDto } from '@/geography/dto/province-summary.dto';
import type { Province, Region } from '@/generated/prisma/client';

/**
 * A region as it appears in `GET /api/v1/regions/{code}` — the summary shape plus one
 * level of nested provinces (OD-3), matching the payload documented in the legacy
 * README.
 *
 * The four scalar fields are re-declared rather than inherited from
 * `RegionSummaryDto`: a detail response and a list item are separate contracts that
 * happen to overlap today, and `canonical-shapes.spec.ts` fails if they drift apart.
 * What is *not* duplicated is the nested province — `ProvinceSummaryDto` is the one
 * definition used everywhere a bare province appears (PHG-010).
 */
@Exclude()
export class RegionDetailDto {
  @ApiProperty({ description: 'ISO 3166-2 region code — the path identifier.', example: 'PH-13' })
  @Expose()
  readonly code: string;

  @ApiProperty({ example: 'Caraga' })
  @Expose()
  readonly name: string;

  @ApiProperty({ name: 'name_tl', description: 'Tagalog name.', example: 'Rehiyon ng Karaga' })
  @Expose({ name: 'name_tl' })
  readonly nameTl: string;

  @ApiProperty({ description: 'Roman-numeral designation.', example: 'XIII' })
  @Expose()
  readonly acronym: string;

  @ApiProperty({
    type: () => [ProvinceSummaryDto],
    description: "The region's provinces, ordered by name.",
  })
  @Expose()
  @Type(() => ProvinceSummaryDto)
  readonly provinces: ProvinceSummaryDto[];

  constructor(region: Region & { provinces: Province[] }) {
    this.code = region.code;
    this.name = region.name;
    this.nameTl = region.nameTl;
    this.acronym = region.acronym;
    this.provinces = region.provinces.map((province) => new ProvinceSummaryDto(province));
  }
}
