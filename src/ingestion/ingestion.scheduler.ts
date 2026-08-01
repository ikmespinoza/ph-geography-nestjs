import { Injectable, Logger } from '@nestjs/common';
import type { OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SchedulerRegistry } from '@nestjs/schedule';
import { CronJob } from 'cron';

import type { IngestionConfig } from '@/config/ingestion.config';
import { IngestionService } from '@/ingestion/ingestion.service';

/** Registry name of the scheduled job — also how tests reach it. */
export const INGESTION_CRON_JOB = 'ingestion';

/**
 * Arms the scheduled scrape. The job is registered dynamically rather than with
 * a `@Cron()` decorator because the expression comes from configuration, which a
 * decorator cannot read without going around the config layer.
 *
 * Kept separate from `IngestionService` so the pipeline can be unit-tested, and
 * run from the CLI, with no scheduler in the graph at all.
 */
@Injectable()
export class IngestionScheduler implements OnModuleInit {
  private readonly logger = new Logger(IngestionScheduler.name);
  private readonly config: IngestionConfig;

  constructor(
    configService: ConfigService,
    private readonly ingestionService: IngestionService,
    private readonly schedulerRegistry: SchedulerRegistry,
  ) {
    this.config = configService.getOrThrow<IngestionConfig>('ingestion');
  }

  onModuleInit(): void {
    if (!this.config.enableSchedule) {
      this.logger.log('Scheduled ingestion is disabled (INGESTION_ENABLE_SCHEDULE=false)');
      return;
    }

    const job = new CronJob(this.config.scheduleCron, () => {
      void this.runScheduled();
    });

    this.schedulerRegistry.addCronJob(INGESTION_CRON_JOB, job);
    job.start();
    this.logger.log(`Scheduled ingestion armed with cron "${this.config.scheduleCron}"`);
  }

  /**
   * The cron callback. Errors are already folded into the run report, so this
   * only has to make sure nothing escapes into an unhandled rejection.
   */
  private async runScheduled(): Promise<void> {
    try {
      const report = await this.ingestionService.run();
      if (!report.ok) {
        this.logger.error('Scheduled ingestion finished with failures');
      }
    } catch (error) {
      const detail = error instanceof Error ? error.stack : String(error);
      this.logger.error('Scheduled ingestion threw', detail);
    }
  }
}
