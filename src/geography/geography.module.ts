import { Module } from '@nestjs/common';

import { CitiesModule } from '@/geography/cities/cities.module';
import { ProvincesModule } from '@/geography/provinces/provinces.module';
import { RegionsModule } from '@/geography/regions/regions.module';

/**
 * The read side of the service — the public `/api/v1` surface. Aggregates the domain
 * modules so `AppModule` imports one thing. Nothing under here writes to the database
 * (that's `ingestion/`).
 */
@Module({
  imports: [RegionsModule, ProvincesModule, CitiesModule],
})
export class GeographyModule {}
