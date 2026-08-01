import { Exclude, Expose, Type } from 'class-transformer';

import { CityClassificationDto } from '@/geography/cities/dto/city-classification.dto';
import { CityProvinceDto } from '@/geography/cities/dto/city-province.dto';
import type { City, Classification, Province } from '@/generated/prisma/client';

/**
 * A city or municipality on the wire, for both
 * `GET /api/v1/regions/{region}/provinces/{province}/cities` and its `/{city}` detail.
 *
 * One class serves both routes because the two payloads are genuinely the same shape:
 * the legacy list eager-loaded `['classification', 'province']` onto raw `City` models
 * and `CityResource` exposed exactly those same fields, so unlike regions and
 * provinces there is no list/detail split to model here (OD-3). PHG-010 splits this in
 * two if it decides list items should go shallow.
 *
 * The province is passed in rather than read off the row: the service anchors its read
 * on the region, so every city in a list shares one instance instead of a per-row join.
 */
@Exclude()
export class CityDto {
  @Expose()
  readonly name: string;

  @Expose({ name: 'alt_name' })
  readonly altName: string | null;

  @Expose({ name: 'full_name' })
  readonly fullName: string;

  /** A real JSON boolean — the legacy needed a `getIsCapitalAttribute` cast for this. */
  @Expose({ name: 'is_capital' })
  readonly isCapital: boolean;

  @Expose()
  @Type(() => CityClassificationDto)
  readonly classification: CityClassificationDto;

  @Expose()
  @Type(() => CityProvinceDto)
  readonly province: CityProvinceDto;

  constructor(city: City & { classification: Classification }, province: Province) {
    this.name = city.name;
    this.altName = city.altName;
    this.fullName = city.fullName;
    this.isCapital = city.isCapital;
    this.classification = new CityClassificationDto(city.classification);
    this.province = new CityProvinceDto(province);
  }
}
