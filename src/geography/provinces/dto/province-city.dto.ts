import { Exclude, Expose, Type } from 'class-transformer';

import { CityClassificationDto } from '@/geography/provinces/dto/city-classification.dto';
import type { City, Classification } from '@/generated/prisma/client';

/**
 * A city or municipality nested inside a province detail response. Cities carry no
 * ISO code (OD-1), so `name` identifies them — it is unique within a province. The
 * back-reference to the province is not repeated here; city endpoints are PHG-009.
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
