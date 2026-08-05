import { DocumentBuilder } from '@nestjs/swagger';
import type { OpenAPIObject } from '@nestjs/swagger';

/** Path the Swagger UI is served from. The raw spec follows at `<path>-json`. */
export const OPENAPI_PATH = 'api/docs';

const DESCRIPTION = `
Read-only reference data for Philippine geography — **regions → provinces → cities/municipalities** —
kept current by a scheduled scraper.

- **Identifiers.** Regions and provinces are addressed by their ISO 3166-2 \`code\` (\`PH-13\`, \`PH-AGN\`).
  Cities have no ISO code, so they are addressed by a \`slug\` of their name, unique within the province.
  All three match **exactly** — a lowercased code or a raw city name is a 404, never a redirect.
- **Responses** are bare payloads (no envelope) with snake_case fields.
- **Errors** are RFC 7807 \`application/problem+json\` with correct status codes — a missing resource is a
  **404**, not a 200.
- **No authentication.** The data is public. Requests are rate-limited per client.
`.trim();

/**
 * The OpenAPI document's static metadata. Kept out of `main.ts` so the bootstrap stays
 * a wiring file, and so a test can build the document without starting a server.
 */
export const openApiConfig: Omit<OpenAPIObject, 'paths'> = new DocumentBuilder()
  .setTitle('PH Geography API')
  .setDescription(DESCRIPTION)
  .setVersion('1')
  .setLicense('MIT', 'https://opensource.org/licenses/MIT')
  .addTag('Regions', 'The 17 administrative regions.')
  .addTag('Provinces', 'Provinces, always addressed under their region.')
  .addTag('Cities', 'Cities and municipalities, always addressed under their province.')
  .addTag('Health', 'Liveness and readiness probes.')
  // No `addServer('/api/v1')`: the generated paths already carry the global prefix and
  // the version, so a server prefix would make "Try it out" request /api/v1/api/v1/…
  .build();
