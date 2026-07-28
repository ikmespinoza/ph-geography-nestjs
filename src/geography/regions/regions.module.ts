import { Module } from '@nestjs/common';

import { RegionsController } from '@/geography/regions/regions.controller';
import { RegionsService } from '@/geography/regions/regions.service';

/** Region endpoints. `PrismaService` comes from the global `PersistenceModule`. */
@Module({
  controllers: [RegionsController],
  providers: [RegionsService],
})
export class RegionsModule {}
