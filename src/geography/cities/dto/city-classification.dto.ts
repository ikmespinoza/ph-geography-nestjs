import { Exclude, Expose } from 'class-transformer';

import type { Classification } from '@/generated/prisma/client';

/**
 * An LGU classification (`Mun`, `CC`, `ICC`, `HUC`) as it appears nested inside a
 * city — both in a city response and in the cities of a province detail. One shape,
 * one owner: it describes a city, so it lives with the cities module (it shipped
 * under `provinces/dto/` in PHG-008 only because provinces landed first).
 */
@Exclude()
export class CityClassificationDto {
  @Expose()
  readonly code: string;

  @Expose()
  readonly description: string;

  constructor(classification: Classification) {
    this.code = classification.code;
    this.description = classification.description;
  }
}
