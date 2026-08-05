import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { SourcesConfig } from '@/config/sources.config';
import type {
  CityRow,
  GeoSource,
  ParseResult,
  ProvinceRow,
  RegionRow,
  ResourceKind,
} from '@/ingestion/scraper-core/geo-source';
import { parseCities } from '@/ingestion/sources/iso3166/city.parser';
import { parseProvinces } from '@/ingestion/sources/iso3166/province.parser';
import { parseRegions } from '@/ingestion/sources/iso3166/region.parser';

/**
 * The ISO 3166 source — the only `GeoSource` implementation (OD-6). Regions and
 * provinces come from one page, cities from another; both URLs are resolved from
 * the `sources` config, which is also what the fetcher's allow-list is built from.
 */
@Injectable()
export class Iso3166Source implements GeoSource {
  readonly name: string;
  readonly regionUrl: string;
  readonly cityUrl: string;

  constructor(configService: ConfigService) {
    const { iso3166 } = configService.getOrThrow<SourcesConfig>('sources');
    this.name = iso3166.name;
    this.regionUrl = iso3166.regionUrl;
    this.cityUrl = iso3166.cityUrl;
  }

  urlFor(resource: ResourceKind): string {
    return resource === 'city' ? this.cityUrl : this.regionUrl;
  }

  parseRegions(html: string): ParseResult<RegionRow> {
    return parseRegions(html);
  }

  parseProvinces(html: string): ParseResult<ProvinceRow> {
    return parseProvinces(html);
  }

  parseCities(html: string): ParseResult<CityRow> {
    return parseCities(html);
  }
}
