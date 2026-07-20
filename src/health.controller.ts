import { Controller, Get } from '@nestjs/common';

/**
 * Temporary liveness ping so the scaffold boots and serves a 200 at
 * GET /api/v1/health. Replaced by real Terminus-based health/readiness checks later.
 */
@Controller('health')
export class HealthController {
  @Get()
  check(): { status: string } {
    return { status: 'ok' };
  }
}
