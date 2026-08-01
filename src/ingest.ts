import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';

import { AppModule } from '@/app.module';
import { IngestionService } from '@/ingestion/ingestion.service';
import type { RunReport } from '@/ingestion/scraper-core/geo-source';

/**
 * `pnpm ingest [--force]` — the controlled manual trigger that replaces the
 * legacy seeder's scrape step and the `GET /test` route (OD-13).
 *
 * It boots an application context rather than an HTTP server: no port is bound,
 * no routes are mounted, and the process exits as soon as the run finishes.
 * The exit code is the run's verdict, so cron wrappers and CI can detect a
 * failed scrape without parsing the log.
 */
async function bootstrap(): Promise<void> {
  const logger = new Logger('Ingest');
  const force = process.argv.includes('--force');

  // A one-shot run must not also arm the daily cron. Setting it here — in the
  // composition root, before Nest boots — keeps the decision in the entry point
  // and out of the modules, which still read it only through the config layer.
  process.env.INGESTION_ENABLE_SCHEDULE = 'false';

  const app = await NestFactory.createApplicationContext(AppModule, {
    // The report is the output; Nest's own boot chatter is not.
    logger: ['log', 'warn', 'error'],
  });
  app.enableShutdownHooks();

  try {
    const report = await app.get(IngestionService).run({ force });
    logger.log(render(report));
    process.exitCode = report.ok ? 0 : 1;
  } catch (error) {
    const detail = error instanceof Error ? error.stack : String(error);
    logger.error('Ingestion run threw', detail);
    process.exitCode = 1;
  } finally {
    await app.close();
  }
}

/** A compact, greppable summary — one line per resource. */
function render(report: RunReport): string {
  const header =
    `run ${report.ok ? 'ok' : 'FAILED'} · source=${report.source} · force=${report.force} · ` +
    `${report.durationMs}ms${report.detail === undefined ? '' : ` · ${report.detail}`}`;

  const lines = report.resources.map(
    (resource) =>
      `  ${resource.resource.padEnd(8)} ${resource.status.padEnd(9)} ` +
      `parsed=${resource.parsed} created=${resource.created} updated=${resource.updated} ` +
      `unchanged=${resource.unchanged} rejected=${resource.rejected} ${resource.durationMs}ms` +
      (resource.detail === undefined ? '' : ` — ${resource.detail}`),
  );

  return [header, ...lines].join('\n');
}

void bootstrap();
