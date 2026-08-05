import { CACHE_MANAGER, CacheInterceptor } from '@nestjs/cache-manager';
import type { Cache } from '@nestjs/cache-manager';
import { Inject, Injectable } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';

import type { CacheConfig } from '@/config/cache.config';
import { HEALTH_PATH_PREFIX } from '@/config/constants';

const MILLISECONDS_PER_SECOND = 1000;

/**
 * Response caching for the read API (PHG-015).
 *
 * **It must be registered as the *first* global interceptor**, ahead of
 * `ClassSerializerInterceptor` — Nest runs globals outermost-first, so this stores
 * the finished snake_case payload rather than the `CityDto` instance that produced
 * it. Two things follow. A hit skips the database read *and* the `class-transformer`
 * pass, and the cache is store-agnostic: were a serializing store ever added, a JSON
 * round-trip of a DTO instance would come back carrying the class's real property
 * names (`altName`, `fullName`), `instanceToPlain` would no-op on the resulting plain
 * object, and the wire would silently revert to camelCase.
 *
 * The stock `trackBy` keys on the full request URL, which is a complete key here: no
 * endpoint takes a query parameter, and `forbidNonWhitelisted` already rejects an
 * unknown one. The whole dataset is ~1,850 distinct URLs of a few KB, so no eviction
 * policy is needed either.
 */
@Injectable()
export class HttpCacheInterceptor extends CacheInterceptor {
  private readonly enabled: boolean;
  private readonly cacheControl: string;

  constructor(
    @Inject(CACHE_MANAGER) cacheManager: Cache,
    reflector: Reflector,
    configService: ConfigService,
  ) {
    super(cacheManager, reflector);

    const { enabled, ttlMs } = configService.getOrThrow<CacheConfig>('cache');
    this.enabled = enabled;
    // Derived from the one TTL so the header a client caches by and the server's own
    // expiry cannot drift apart.
    this.cacheControl = `public, max-age=${Math.floor(ttlMs / MILLISECONDS_PER_SECOND)}`;
  }

  /**
   * Health is the one route that must never be cached — a stale readiness probe is
   * worse than none. The stock implementation checks only that the method is GET,
   * which would happily cache it.
   */
  protected override isRequestCacheable(context: ExecutionContext): boolean {
    if (!this.enabled) {
      return false;
    }

    const { path } = context.switchToHttp().getRequest<Request>();

    return super.isRequestCacheable(context) && !path.startsWith(HEALTH_PATH_PREFIX);
  }

  /**
   * Adds `Cache-Control` alongside the stock `X-Cache: HIT|MISS`.
   *
   * This hook is deliberately where the header goes: the base interceptor calls it on
   * both the hit and the miss path, whereas a separate inner interceptor would never
   * run on a hit and would drop the header exactly when the response is cached.
   */
  protected override setHeadersWhenHttp(context: ExecutionContext, value: unknown): void {
    super.setHeadersWhenHttp(context, value);

    const httpAdapter = this.httpAdapterHost?.httpAdapter;
    if (!httpAdapter) {
      return;
    }

    httpAdapter.setHeader(context.switchToHttp().getResponse(), 'Cache-Control', this.cacheControl);
  }
}
