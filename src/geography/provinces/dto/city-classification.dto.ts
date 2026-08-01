import { Exclude, Expose } from 'class-transformer';

import type { Classification } from '@/generated/prisma/client';

/**
 * An LGU classification (`Mun`, `CC`, `ICC`, `HUC`) as it appears nested inside a
 * city. Lives with the province DTOs because that is what nests it today; PHG-009
 * decides whether the cities module shares this shape or needs its own.
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
