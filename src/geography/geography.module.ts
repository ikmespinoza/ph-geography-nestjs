import { Module } from '@nestjs/common';

import { RegionsModule } from '@/geography/regions/regions.module';

/**
 * The read side of the service — the public `/api/v1` surface. Aggregates the domain
 * modules so `AppModule` imports one thing; provinces and cities join in PHG-008/009.
 * Nothing under here writes to the database (that's `ingestion/`).
 */
@Module({
  imports: [RegionsModule],
})
export class GeographyModule {}
