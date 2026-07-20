import { registerAs } from '@nestjs/config';

import { validateEnv } from '@/config/env.validation';

export interface Iso3166SourceConfig {
  /** Human-readable source name (for logs / provenance). */
  readonly name: string;
  /** Wikipedia page listing PH regions & provinces (ISO 3166-2:PH). */
  readonly regionUrl: string;
  /** Wikipedia page listing PH cities & municipalities. */
  readonly cityUrl: string;
}

export interface SourcesConfig {
  readonly iso3166: Iso3166SourceConfig;
}

/**
 * `sources` namespace — the allow-listed scrape URLs (ported from legacy
 * `constants.php` `source.iso3166.url.*`). The scraper fetches only these.
 */
export const sourcesConfig = registerAs('sources', (): SourcesConfig => {
  const env = validateEnv(process.env);

  return {
    iso3166: {
      name: 'ISO 3166',
      regionUrl: env.SOURCE_ISO3166_REGION_URL,
      cityUrl: env.SOURCE_ISO3166_CITY_URL,
    },
  };
});
