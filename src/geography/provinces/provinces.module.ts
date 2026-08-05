import { Module } from '@nestjs/common';

import { ProvincesController } from '@/geography/provinces/provinces.controller';
import { ProvincesService } from '@/geography/provinces/provinces.service';

/** Province endpoints. `PrismaService` comes from the global `PersistenceModule`. */
@Module({
  controllers: [ProvincesController],
  providers: [ProvincesService],
})
export class ProvincesModule {}
