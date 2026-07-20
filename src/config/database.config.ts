import { registerAs } from '@nestjs/config';

import { validateEnv } from '@/config/env.validation';

export interface DatabaseConfig {
  /** PostgreSQL connection string. Consumed by Prisma in PHG-003. */
  readonly url: string;
}

/**
 * `database` namespace — a thin, validated `DATABASE_URL` home. PHG-003 builds
 * the Prisma datasource on top of this.
 */
export const databaseConfig = registerAs('database', (): DatabaseConfig => {
  const env = validateEnv(process.env);

  return {
    url: env.DATABASE_URL,
  };
});
