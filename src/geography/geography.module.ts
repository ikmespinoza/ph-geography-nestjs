import { Module } from '@nestjs/common';

import { ProvincesModule } from '@/geography/provinces/provinces.module';
import { RegionsModule } from '@/geography/regions/regions.module';

/**
 * The read side of the service — the public `/api/v1` surface. Aggregates the domain
 * modules so `AppModule` imports one thing; cities join in PHG-009. Nothing under
 * here writes to the database (that's `ingestion/`).
 */
@Module({
  imports: [RegionsModule, ProvincesModule],
})
export class GeographyModule {}
