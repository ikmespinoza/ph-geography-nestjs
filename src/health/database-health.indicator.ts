import { Injectable } from '@nestjs/common';
import { PrismaHealthIndicator } from '@nestjs/terminus';
import type { HealthIndicatorResult } from '@nestjs/terminus';

import { PrismaService } from '@/persistence/prisma.service';

/**
 * "Does the database answer?" — Terminus' own Prisma indicator, paired with the
 * client it should ping.
 *
 * Terminus' documented usage passes the client from the controller
 * (`pingCheck('database', this.prisma)`), which would put `PrismaService` in a
 * controller's constructor. This keeps the project's rule intact — the database is
 * reached from a provider, and the controller composes indicators only.
 *
 * The ping itself is a `SELECT 1` with a 1 s default timeout. Terminus reaches it via
 * `$queryRawUnsafe`, but only after first trying the Mongo-only `$runCommandRaw` and
 * matching the resulting "Use the mongodb provider" error — so an upstream change to
 * that error text, not to our code, is what would break this check.
 */
@Injectable()
export class DatabaseHealthIndicator {
  constructor(
    private readonly prismaIndicator: PrismaHealthIndicator,
    private readonly prisma: PrismaService,
  ) {}

  check(): Promise<HealthIndicatorResult<'database'>> {
    return this.prismaIndicator.pingCheck('database', this.prisma);
  }
}
