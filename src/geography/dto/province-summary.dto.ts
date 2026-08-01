import { Exclude, Expose } from 'class-transformer';

import { blankToNull } from '@/common/text/nullable.util';
import type { Province } from '@/generated/prisma/client';

/**
 * A province without its children — the canonical province shape (PHG-010).
 *
 * One class covers every place a bare province appears: the `provinces[]` of a region
 * detail, and the `province` nested inside a city. PHG-007 and PHG-009 each grew their
 * own field-identical copy (`RegionProvinceDto`, `CityProvinceDto`); merging them is
 * what makes "identical wherever it appears" structural rather than something a test
 * has to police.
 *
 * Neither a province's `cities` nor its back-reference to its region is repeated here
 * — the caller of either nesting already holds the other side.
 *
 * `alt_name` is `string | null` and is always present on the wire — never omitted, and
 * `null` rather than `''` when the province has no former name, which `blankToNull`
 * guarantees whatever the column happens to hold. That matches the legacy README,
 * where every documented `alt_name` is either a name or `null`.
 */
@Exclude()
export class ProvinceSummaryDto {
  @Expose()
  readonly code: string;

  @Expose()
  readonly name: string;

  @Expose({ name: 'alt_name' })
  readonly altName: string | null;

  @Expose({ name: 'name_tl' })
  readonly nameTl: string;

  constructor(province: Province) {
    this.code = province.code;
    this.name = province.name;
    this.altName = blankToNull(province.altName);
    this.nameTl = province.nameTl;
  }
}
