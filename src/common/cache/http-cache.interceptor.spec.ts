import type { Cache } from '@nestjs/cache-manager';
import type { ExecutionContext } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { Reflector } from '@nestjs/core';

import { HttpCacheInterceptor } from '@/common/cache/http-cache.interceptor';
import type { CacheConfig } from '@/config/cache.config';

const CACHE_ENABLED: CacheConfig = { enabled: true, ttlMs: 60_000 };

function createInterceptor(config: CacheConfig = CACHE_ENABLED): HttpCacheInterceptor {
  const configService = { getOrThrow: (): CacheConfig => config } as unknown as ConfigService;

  return new HttpCacheInterceptor(
    {} as unknown as Cache,
    { get: jest.fn() } as unknown as Reflector,
    configService,
  );
}

/** A minimal HTTP `ExecutionContext` — `isRequestCacheable` reads only method and path. */
function contextFor(method: string, path: string): ExecutionContext {
  const response = { setHeader: jest.fn() };

  return {
    switchToHttp: () => ({
      getRequest: () => ({ method, path }),
      getResponse: () => response,
    }),
  } as unknown as ExecutionContext;
}

/** `isRequestCacheable` is `protected`; the tests exercise it as the subclass's contract. */
function isCacheable(interceptor: HttpCacheInterceptor, context: ExecutionContext): boolean {
  return (
    interceptor as unknown as { isRequestCacheable(context: ExecutionContext): boolean }
  ).isRequestCacheable(context);
}

describe('HttpCacheInterceptor', () => {
  describe('isRequestCacheable', () => {
    it.each([
      '/api/v1/regions',
      '/api/v1/regions/PH-13',
      '/api/v1/regions/PH-13/provinces',
      '/api/v1/regions/PH-13/provinces/PH-SUR/cities/bislig',
    ])('caches the read endpoint %s', (path) => {
      expect(isCacheable(createInterceptor(), contextFor('GET', path))).toBe(true);
    });

    // A cached readiness probe is worse than no probe: it would report the state the
    // service was in a minute ago, which is exactly what the endpoint must not do.
    it.each(['/api/v1/health', '/api/v1/health/ready'])('never caches %s', (path) => {
      expect(isCacheable(createInterceptor(), contextFor('GET', path))).toBe(false);
    });

    it('leaves non-GET requests alone', () => {
      expect(isCacheable(createInterceptor(), contextFor('POST', '/api/v1/regions'))).toBe(false);
    });

    it('caches nothing at all when disabled by config', () => {
      const interceptor = createInterceptor({ enabled: false, ttlMs: 60_000 });

      expect(isCacheable(interceptor, contextFor('GET', '/api/v1/regions'))).toBe(false);
    });
  });

  describe('Cache-Control', () => {
    it('derives max-age in seconds from the millisecond TTL', () => {
      const interceptor = createInterceptor({ enabled: true, ttlMs: 90_000 });
      const setHeader = jest.fn();
      // The base class reaches the response through the http adapter; stub just that.
      (interceptor as unknown as { httpAdapterHost: unknown }).httpAdapterHost = {
        httpAdapter: { setHeader },
      };

      (
        interceptor as unknown as {
          setHeadersWhenHttp(context: ExecutionContext, value: unknown): void;
        }
      ).setHeadersWhenHttp(contextFor('GET', '/api/v1/regions'), undefined);

      expect(setHeader).toHaveBeenCalledWith(expect.anything(), 'X-Cache', 'MISS');
      expect(setHeader).toHaveBeenCalledWith(
        expect.anything(),
        'Cache-Control',
        'public, max-age=90',
      );
    });

    it('reports a hit when a cached value is present', () => {
      const interceptor = createInterceptor();
      const setHeader = jest.fn();
      (interceptor as unknown as { httpAdapterHost: unknown }).httpAdapterHost = {
        httpAdapter: { setHeader },
      };

      (
        interceptor as unknown as {
          setHeadersWhenHttp(context: ExecutionContext, value: unknown): void;
        }
      ).setHeadersWhenHttp(contextFor('GET', '/api/v1/regions'), [{ code: 'PH-13' }]);

      expect(setHeader).toHaveBeenCalledWith(expect.anything(), 'X-Cache', 'HIT');
      // Set on the hit path too — this is why the header lives in this hook rather
      // than in a separate inner interceptor, which a hit would skip entirely.
      expect(setHeader).toHaveBeenCalledWith(
        expect.anything(),
        'Cache-Control',
        'public, max-age=60',
      );
    });
  });
});
