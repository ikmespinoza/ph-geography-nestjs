import { Global, Module } from '@nestjs/common';

import { PrismaService } from '@/persistence/prisma.service';

/**
 * Global persistence layer. Exposes the shared `PrismaService` so any feature
 * module (geography reads, ingestion writes) injects the same DB gateway without
 * re-importing this module. The one seam to the database lives here.
 */
@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PersistenceModule {}
