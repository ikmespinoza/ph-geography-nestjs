import { Exclude, Expose, Type } from 'class-transformer';

import { CityClassificationDto } from '@/geography/cities/dto/city-classification.dto';
import type { City, Classification } from '@/generated/prisma/client';

/**
 * A city or municipality nested inside a province detail response — the same city
 * minus the back-reference to the province the caller already asked for. The full city
 * resource is served by the cities module (PHG-009), which owns the shared
 * `CityClassificationDto`; addressing a city there uses a slug of this `name`, which
 * is unique within the province (OD-1 — cities carry no ISO code).
 */
@Exclude()
export class ProvinceCityDto {
  @Expose()
  readonly name: string;

  @Expose({ name: 'alt_name' })
  readonly altName: string | null;

  @Expose({ name: 'full_name' })
  readonly fullName: string;

  @Expose({ name: 'is_capital' })
  readonly isCapital: boolean;

  @Expose()
  @Type(() => CityClassificationDto)
  readonly classification: CityClassificationDto;

  constructor(city: City & { classification: Classification }) {
    this.name = city.name;
    this.altName = city.altName;
    this.fullName = city.fullName;
    this.isCapital = city.isCapital;
    this.classification = new CityClassificationDto(city.classification);
  }
}
