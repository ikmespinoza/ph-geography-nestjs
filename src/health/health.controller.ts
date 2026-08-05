import { Controller, Get, UseFilters } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { HealthCheck, HealthCheckService } from '@nestjs/terminus';
import type { HealthCheckResult } from '@nestjs/terminus';
import { SkipThrottle } from '@nestjs/throttler';

import { DatabaseHealthIndicator } from '@/health/database-health.indicator';
import { HealthCheckFilter } from '@/health/health-check.filter';
import { IngestionHealthIndicator } from '@/health/ingestion-health.indicator';

/**
 * `/api/v1/health` — the container's two probes.
 *
 * `@SkipThrottle()` because a probe on a 10-second period would otherwise spend the
 * rate-limit budget and start collecting 429s, which an orchestrator reads as
 * "unhealthy" — a self-inflicted restart loop. Responses here are also never cached
 * (see `HttpCacheInterceptor`) and never auto-logged.
 *
 * Terminus additionally answers 503 on every check once `beforeApplicationShutdown`
 * has fired, so `enableShutdownHooks()` gives us the drain signal for free — and its
 * `@HealthCheck()` decorator sets `Cache-Control: no-store` itself, a second layer
 * under the interceptor's path exemption.
 */
@ApiTags('Health')
@SkipThrottle()
@UseFilters(HealthCheckFilter)
@Controller('health')
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly database: DatabaseHealthIndicator,
    private readonly ingestion: IngestionHealthIndicator,
  ) {}

  /**
   * Liveness — deliberately touches nothing. A liveness probe answers "is this
   * process still running its event loop"; wiring it to the database is how a brief
   * connectivity blip becomes a container restart loop.
   */
  @Get()
  @ApiOperation({
    summary: 'Liveness probe',
    description:
      'Answers 200 while the process is running, touching no dependencies. Returns 503 once shutdown has begun.',
  })
  @HealthCheck()
  liveness(): Promise<HealthCheckResult> {
    return this.health.check([]);
  }

  /** Readiness — can this instance actually serve? Database reachable, data present. */
  @Get('ready')
  @ApiOperation({
    summary: 'Readiness probe',
    description:
      'Checks that the database answers and that ingestion has populated it at least once. Ingestion *staleness* is reported as data, not failed on — a source page that has not changed legitimately leaves the timestamp untouched.',
  })
  @HealthCheck()
  readiness(): Promise<HealthCheckResult> {
    return this.health.check([() => this.database.check(), () => this.ingestion.check()]);
  }
}
