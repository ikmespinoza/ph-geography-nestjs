import { ApiProperty } from '@nestjs/swagger';
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
  @ApiProperty({
    description:
      'LGU classification code: `Mun` (municipality), `CC` (component city), `ICC` (independent component city) or `HUC` (highly urbanized city).',
    enum: ['Mun', 'CC', 'ICC', 'HUC'],
    example: 'CC',
  })
  @Expose()
  readonly code: string;

  @ApiProperty({ description: 'Human-readable classification.', example: 'Component City' })
  @Expose()
  readonly description: string;

  constructor(classification: Classification) {
    this.code = classification.code;
    this.description = classification.description;
  }
}
