import type { ConfigService } from '@nestjs/config';
import type { SchedulerRegistry } from '@nestjs/schedule';

import type { IngestionConfig } from '@/config/ingestion.config';
import { INGESTION_CRON_JOB, IngestionScheduler } from '@/ingestion/ingestion.scheduler';
import type { IngestionService } from '@/ingestion/ingestion.service';

const BASE: IngestionConfig = {
  scheduleCron: '0 3 * * *',
  requestTimeoutMs: 15_000,
  userAgent: 'test',
  maxRetries: 2,
  retryBackoffMs: 500,
  enableSchedule: true,
};

describe('IngestionScheduler', () => {
  const addCronJob = jest.fn();
  const run = jest.fn();

  function build(overrides: Partial<IngestionConfig> = {}): IngestionScheduler {
    const configService = {
      getOrThrow: () => ({ ...BASE, ...overrides }),
    } as unknown as ConfigService;

    return new IngestionScheduler(
      configService,
      { run } as unknown as IngestionService,
      { addCronJob } as unknown as SchedulerRegistry,
    );
  }

  beforeEach(() => {
    jest.resetAllMocks();
    run.mockResolvedValue({ ok: true, resources: [] });
  });

  afterEach(() => {
    // The scheduler starts a real timer; Nest stops it via the registry on
    // shutdown, but a unit test has no app lifecycle to do that for it.
    for (const [, job] of addCronJob.mock.calls as [string, { stop: () => void }][]) {
      job.stop();
    }
  });

  it('registers the job under the configured cron expression', () => {
    build().onModuleInit();

    expect(addCronJob).toHaveBeenCalledTimes(1);
    const [name, job] = addCronJob.mock.calls[0] as [string, { cronTime: { source: string } }];
    expect(name).toBe(INGESTION_CRON_JOB);
    expect(String(job.cronTime.source)).toBe('0 3 * * *');
  });

  it('registers nothing when scheduling is disabled', () => {
    build({ enableSchedule: false }).onModuleInit();

    expect(addCronJob).not.toHaveBeenCalled();
  });

  it('does not run ingestion at registration time', () => {
    build().onModuleInit();

    expect(run).not.toHaveBeenCalled();
  });

  it('surfaces an invalid cron expression at boot instead of never firing', () => {
    expect(() => build({ scheduleCron: 'not a cron' }).onModuleInit()).toThrow();
  });
});
