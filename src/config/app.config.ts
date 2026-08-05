import { registerAs } from '@nestjs/config';

import { validateEnv } from '@/config/env.validation';

export interface AppConfig {
  /** HTTP listen port. */
  readonly port: number;
  /** Runtime environment. */
  readonly nodeEnv: 'development' | 'test' | 'production';
  /** Global route prefix — every route is served under this. */
  readonly globalPrefix: string;
  /** Default URI API version (`/api/v1`). */
  readonly apiVersion: string;
}

/**
 * `app` namespace — HTTP/runtime concerns. `globalPrefix`/`apiVersion` are fixed
 * contract values (see main.ts), not env-tunable, so they live here rather than
 * in the env schema.
 */
export const appConfig = registerAs('app', (): AppConfig => {
  const env = validateEnv(process.env);

  return {
    port: env.PORT,
    nodeEnv: env.NODE_ENV,
    globalPrefix: 'api',
    apiVersion: '1',
  };
});
