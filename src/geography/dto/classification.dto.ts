import { Exclude, Expose } from 'class-transformer';

import type { Classification } from '@/generated/prisma/client';

/**
 * An LGU classification (`Mun`, `CC`, `ICC`, `HUC`) — the canonical classification
 * shape (PHG-010).
 *
 * Always nested inside a city, in both places a city appears: the city resource itself
 * and the `cities[]` of a province detail. There is no standalone classification
 * endpoint — the legacy `ClassificationController` is an empty stub and is not ported.
 */
@Exclude()
export class ClassificationDto {
  @Expose()
  readonly code: string;

  @Expose()
  readonly description: string;

  constructor(classification: Classification) {
    this.code = classification.code;
    this.description = classification.description;
  }
}
