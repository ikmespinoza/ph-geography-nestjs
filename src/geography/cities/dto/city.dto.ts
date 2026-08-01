import { Exclude, Expose, Type } from 'class-transformer';

import { blankToNull } from '@/common/text/nullable.util';
import { slugify } from '@/common/text/slug.util';
import { ClassificationDto } from '@/geography/dto/classification.dto';
import { ProvinceSummaryDto } from '@/geography/dto/province-summary.dto';
import type { City, Classification, Province } from '@/generated/prisma/client';

/**
 * A city or municipality on the wire, for both
 * `GET /api/v1/regions/{region}/provinces/{province}/cities` and its `/{city}` detail.
 *
 * One class serves both routes because the two payloads are genuinely the same shape:
 * the legacy list eager-loaded `['classification', 'province']` onto raw `City` models
 * and `CityResource` exposed exactly those same fields, so unlike regions and provinces
 * there is no list/detail split to model here — PHG-010 froze it that way (OD-3).
 *
 * This is `CitySummaryDto` plus the `province` back-reference, and nothing else;
 * `canonical-shapes.spec.ts` fails if the two ever diverge by more than that key. The
 * province is passed in rather than read off the row: the service anchors its read on
 * the region, so every city in a list shares one instance instead of a per-row join.
 */
@Exclude()
export class CityDto {
  @Expose()
  readonly name: string;

  /** The identifier this city is addressed by (OD-15) — see `CitySummaryDto.slug`. */
  @Expose()
  readonly slug: string;

  @Expose({ name: 'alt_name' })
  readonly altName: string | null;

  @Expose({ name: 'full_name' })
  readonly fullName: string;

  /** A real JSON boolean — the legacy needed a `getIsCapitalAttribute` cast for this. */
  @Expose({ name: 'is_capital' })
  readonly isCapital: boolean;

  @Expose()
  @Type(() => ClassificationDto)
  readonly classification: ClassificationDto;

  /**
   * The field the legacy `CityResource` got wrong (OD-5): it mapped
   * `'province' => $this->provinces`, a plural relation `City` never declared, so the
   * key came back empty. Here it is the singular province, populated from the same
   * region-anchored read that found the city.
   */
  @Expose()
  @Type(() => ProvinceSummaryDto)
  readonly province: ProvinceSummaryDto;

  constructor(city: City & { classification: Classification }, province: Province) {
    this.name = city.name;
    this.slug = slugify(city.name);
    this.altName = blankToNull(city.altName);
    this.fullName = city.fullName;
    this.isCapital = city.isCapital;
    this.classification = new ClassificationDto(city.classification);
    this.province = new ProvinceSummaryDto(province);
  }
}
