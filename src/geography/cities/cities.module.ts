import { Module } from '@nestjs/common';

import { CitiesController } from '@/geography/cities/cities.controller';
import { CitiesService } from '@/geography/cities/cities.service';

/** City endpoints. `PrismaService` comes from the global `PersistenceModule`. */
@Module({
  controllers: [CitiesController],
  providers: [CitiesService],
})
export class CitiesModule {}
