import { Exclude, Expose, Type } from 'class-transformer';

import { blankToNull } from '@/common/text/nullable.util';
import { slugify } from '@/common/text/slug.util';
import { ClassificationDto } from '@/geography/dto/classification.dto';
import type { City, Classification } from '@/generated/prisma/client';

/**
 * A city or municipality without its back-reference to a province — the canonical
 * city shape (PHG-010).
 *
 * Used for the `cities[]` of a province detail, where the caller already asked for the
 * province. `CityDto` is this same shape plus that `province`, which is the only way
 * the two payloads differ.
 *
 * Carrying `classification` here is a deliberate divergence in our favour (OD-14): the
 * legacy `ProvinceResource` lazy-loads its cities, so Eloquent never serialized the
 * relation its own README documents.
 */
@Exclude()
export class CitySummaryDto {
  @Expose()
  readonly name: string;

  /**
   * The identifier this city is addressed by (OD-15) — derived from `name`, never
   * stored. Exposing it saves every consumer from reimplementing the accent-stripping
   * rule in `slugify` just to build the detail URL, and guarantees the value on the
   * wire is exactly the one the service matches against.
   */
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

  constructor(city: City & { classification: Classification }) {
    this.name = city.name;
    this.slug = slugify(city.name);
    this.altName = blankToNull(city.altName);
    this.fullName = city.fullName;
    this.isCapital = city.isCapital;
    this.classification = new ClassificationDto(city.classification);
  }
}
