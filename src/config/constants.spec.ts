import { appConfig } from '@/config/app.config';
import { HEALTH_PATH_PREFIX } from '@/config/constants';

const originalEnv = process.env;

describe('HEALTH_PATH_PREFIX', () => {
  // `appConfig()` re-validates the whole environment, so give it the one required key.
  beforeEach(() => {
    process.env = { ...originalEnv, DATABASE_URL: 'postgresql://u:p@localhost:5432/db' };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  /**
   * The constant is hardcoded so interceptors don't have to inject `ConfigService` to
   * rebuild a fixed string. This is the check that keeps that shortcut honest: if the
   * global prefix or the API version ever changes, the exemptions for caching,
   * throttling and request logging would silently stop matching the health routes.
   */
  it('matches the prefix the app actually serves health under', () => {
    const { globalPrefix, apiVersion } = appConfig();

    expect(HEALTH_PATH_PREFIX).toBe(`/${globalPrefix}/v${apiVersion}/health`);
  });

  it('is an absolute path, so `startsWith` on a request path is a valid test', () => {
    expect(HEALTH_PATH_PREFIX.startsWith('/')).toBe(true);
    expect(HEALTH_PATH_PREFIX.endsWith('/')).toBe(false);
  });
});
