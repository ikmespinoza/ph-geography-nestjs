import { VersioningType } from '@nestjs/common';
import type { INestApplication } from '@nestjs/common';
import { SwaggerModule } from '@nestjs/swagger';
import type {
  OpenAPIObject,
  SchemaObject,
} from '@nestjs/swagger/dist/interfaces/open-api-spec.interface';
import { Test } from '@nestjs/testing';
import type { TestingModule } from '@nestjs/testing';
import request from 'supertest';

import { AppModule } from '@/app.module';
import { OPENAPI_PATH, openApiConfig } from '@/config/openapi';
import { PrismaService } from '@/persistence/prisma.service';

/**
 * PHG-016 acceptance.
 *
 * The load-bearing part is the schema-vs-payload comparison: the field names are
 * carried by `@Expose({ name })` and re-declared by hand in `@ApiProperty({ name })`,
 * so nothing but a test stops the two drifting. Each documented schema is checked
 * against the *same* field list the PHG-010 serialization snapshots pin, which turns
 * "the spec matches the DTOs" from a review item into a failing build.
 */

/** The frozen wire contract (PHG-010). Any change here must be a deliberate one. */
const FROZEN_SHAPES: Record<string, string[]> = {
  RegionSummaryDto: ['acronym', 'code', 'name', 'name_tl'],
  RegionDetailDto: ['acronym', 'code', 'name', 'name_tl', 'provinces'],
  ProvinceSummaryDto: ['alt_name', 'code', 'name', 'name_tl'],
  ProvinceListItemDto: ['alt_name', 'code', 'name', 'name_tl', 'region'],
  ProvinceDetailDto: ['alt_name', 'cities', 'code', 'name', 'name_tl', 'region'],
  CitySummaryDto: ['alt_name', 'classification', 'full_name', 'is_capital', 'name', 'slug'],
  CityDto: ['alt_name', 'classification', 'full_name', 'is_capital', 'name', 'province', 'slug'],
  ClassificationDto: ['code', 'description'],
};

const EXPECTED_PATHS = [
  '/api/v1/regions',
  '/api/v1/regions/{code}',
  '/api/v1/regions/{region}/provinces',
  '/api/v1/regions/{region}/provinces/{province}',
  '/api/v1/regions/{region}/provinces/{province}/cities',
  '/api/v1/regions/{region}/provinces/{province}/cities/{city}',
  '/api/v1/health',
  '/api/v1/health/ready',
];

describe('OpenAPI (e2e)', () => {
  let app: INestApplication;
  let document: OpenAPIObject;

  const schemaFor = (name: string): SchemaObject =>
    (document.components?.schemas?.[name] ?? {}) as SchemaObject;

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue({
        onModuleInit: jest.fn().mockResolvedValue(undefined),
        onModuleDestroy: jest.fn().mockResolvedValue(undefined),
      })
      .compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
    SwaggerModule.setup(OPENAPI_PATH, app, () => SwaggerModule.createDocument(app, openApiConfig));
    await app.init();

    document = SwaggerModule.createDocument(app, openApiConfig);
  });

  afterAll(async () => {
    await app.close();
  });

  describe('serving', () => {
    it('renders the UI at /api/docs', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/docs')
        .expect(200)
        .expect('Content-Type', /text\/html/);

      expect(response.text).toContain('swagger');
    });

    it('serves the raw spec at /api/docs-json', async () => {
      const response = await request(app.getHttpServer()).get('/api/docs-json').expect(200);

      expect(response.body.openapi).toMatch(/^3\./);
      expect(response.body.info.title).toBe('PH Geography API');
    });

    it('mounts the docs outside the versioned prefix and declares no extra server', () => {
      // The generated paths already carry `/api/v1`; an `addServer('/api/v1')` would
      // make Swagger UI's "Try it out" request /api/v1/api/v1/… .
      expect(document.servers ?? []).toHaveLength(0);
      expect(Object.keys(document.paths).every((path) => path.startsWith('/api/v1/'))).toBe(true);
    });
  });

  describe('coverage', () => {
    it('documents every endpoint the service serves', () => {
      expect(Object.keys(document.paths).sort()).toEqual([...EXPECTED_PATHS].sort());
    });

    it('tags each route group so the UI groups them', () => {
      const tagsFor = (path: string): string[] => document.paths[path]?.get?.tags ?? [];

      expect(tagsFor('/api/v1/regions')).toEqual(['Regions']);
      expect(tagsFor('/api/v1/regions/{region}/provinces')).toEqual(['Provinces']);
      expect(tagsFor('/api/v1/regions/{region}/provinces/{province}/cities')).toEqual(['Cities']);
      expect(tagsFor('/api/v1/health')).toEqual(['Health']);
    });
  });

  describe('schemas match the frozen DTOs (PHG-010)', () => {
    it.each(Object.entries(FROZEN_SHAPES))(
      '%s documents exactly its wire fields',
      (name, fields) => {
        const schema = schemaFor(name);

        expect(Object.keys(schema.properties ?? {}).sort()).toEqual(fields);
      },
    );

    it('documents snake_case names, not the TypeScript identifiers', () => {
      // The `@Expose({ name })` renames are invisible to the Swagger CLI plugin, which
      // is exactly why the plugin is not enabled and the decorators are explicit.
      const city = Object.keys(schemaFor('CityDto').properties ?? {});

      expect(city).toEqual(expect.arrayContaining(['full_name', 'is_capital', 'alt_name']));
      expect(city).not.toEqual(expect.arrayContaining(['fullName', 'isCapital', 'altName']));
    });

    it('marks every field required — the payloads omit nothing', () => {
      for (const [name, fields] of Object.entries(FROZEN_SHAPES)) {
        expect(schemaFor(name).required?.slice().sort()).toEqual(fields);
      }
    });

    it('models a missing alt_name as a nullable string rather than an absent key', () => {
      const altName = (schemaFor('ProvinceSummaryDto').properties?.alt_name ?? {}) as SchemaObject;

      expect(altName.type).toBe('string');
      expect(altName.nullable).toBe(true);
    });

    it('documents the slug rule normatively (OD-15)', () => {
      const slug = schemaFor('CitySummaryDto').properties?.slug as SchemaObject | undefined;

      expect(slug?.description).toContain('Derived from `name`, never stored');
      expect(slug?.description).toContain('404');
    });
  });

  describe('error responses', () => {
    it('documents 404 as a problem document on the routes that can miss', () => {
      const responses = document.paths['/api/v1/regions/{code}']?.get?.responses ?? {};

      expect(responses['404']).toBeDefined();
      expect(JSON.stringify(responses['404'])).toContain('ProblemDetailsDto');
    });

    it('does not document a 404 on the regions list, which answers [] instead', () => {
      const responses = document.paths['/api/v1/regions']?.get?.responses ?? {};

      expect(responses['404']).toBeUndefined();
    });

    it('documents the rate limit (OD-12) and the server error', () => {
      const responses = document.paths['/api/v1/regions']?.get?.responses ?? {};

      expect(responses['429']).toBeDefined();
      expect(responses['500']).toBeDefined();
    });

    /**
     * D5. No endpoint takes a body or a query parameter, so request validation cannot
     * fail — and the pipe would answer 400 rather than 422 if it ever could.
     * Documenting an unproducible response is a lie the spec would carry forever.
     */
    it('documents no 422 anywhere, because no route can produce one', () => {
      for (const path of Object.values(document.paths)) {
        expect(path.get?.responses?.['422']).toBeUndefined();
      }
    });
  });

  describe('examples resolve to real routes (D6)', () => {
    /** OpenAPI 3 carries a parameter's example under its schema, not on the parameter. */
    const examplesFor = (path: string): Record<string, unknown> => {
      const params = (document.paths[path]?.get?.parameters ?? []) as {
        name: string;
        schema?: SchemaObject;
      }[];

      return Object.fromEntries(params.map((param) => [param.name, param.schema?.example]));
    };

    it('uses a city example that actually sits under the documented province', () => {
      // Bislig is a component city of Surigao del Sur, not of Agusan del Norte — the
      // trio the legacy README implied would 404 if a reader pasted it.
      expect(examplesFor('/api/v1/regions/{region}/provinces/{province}/cities/{city}')).toEqual({
        region: 'PH-13',
        province: 'PH-SUR',
        city: 'bislig',
      });
    });

    it('documents the slug rule on the :city parameter as well as on the field', () => {
      const params = (document.paths['/api/v1/regions/{region}/provinces/{province}/cities/{city}']
        ?.get?.parameters ?? []) as { name: string; description?: string }[];
      const city = params.find((param) => param.name === 'city');

      expect(city?.description).toContain('Derived from `name`, never stored');
    });
  });
});
