import { Injectable, Logger } from '@nestjs/common';
import type { OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaPg } from '@prisma/adapter-pg';

import type { DatabaseConfig } from '@/config/database.config';
import { PrismaClient } from '@/generated/prisma/client';

/**
 * The single gateway to PostgreSQL. Extends the generated Prisma client so every
 * repository injects one typed DB accessor. Prisma 7 connects through the `pg`
 * driver adapter, whose connection string comes only from the validated
 * `database` config namespace — never `process.env` directly.
 *
 * Lifecycle is bound to Nest: connect on init (failing loudly so a bad
 * DATABASE_URL surfaces at boot), disconnect on shutdown via `enableShutdownHooks`.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  constructor(configService: ConfigService) {
    const { url } = configService.getOrThrow<DatabaseConfig>('database');
    super({ adapter: new PrismaPg({ connectionString: url }) });
  }

  async onModuleInit(): Promise<void> {
    try {
      await this.$connect();
      this.logger.log('Database connection established');
    } catch (error) {
      const detail = error instanceof Error ? error.stack : String(error);
      this.logger.error('Failed to connect to the database', detail);
      throw error;
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
