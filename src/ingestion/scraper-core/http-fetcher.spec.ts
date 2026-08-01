import type { ConfigService } from '@nestjs/config';

import { HttpFetcher } from '@/ingestion/scraper-core/http-fetcher';
import { ScrapeError } from '@/ingestion/scraper-core/scrape-error';

const REGION_URL = 'https://en.wikipedia.org/wiki/ISO_3166-2:PH';
const CITY_URL = 'https://en.wikipedia.org/wiki/List_of_cities';

const config = {
  ingestion: {
    scheduleCron: '0 3 * * *',
    requestTimeoutMs: 15_000,
    userAgent: 'ph-geography-api/test',
    maxRetries: 2,
    retryBackoffMs: 0,
    enableSchedule: false,
  },
  sources: {
    iso3166: { name: 'ISO 3166', regionUrl: REGION_URL, cityUrl: CITY_URL },
  },
} as const;

function buildFetcher(): HttpFetcher {
  const configService = {
    getOrThrow: jest.fn((key: 'ingestion' | 'sources') => config[key]),
  } as unknown as ConfigService;

  return new HttpFetcher(configService);
}

function response(status: number, body = '<html></html>'): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: String(status),
    text: () => Promise.resolve(body),
  } as unknown as Response;
}

describe('HttpFetcher', () => {
  const fetchMock = jest.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    global.fetch = fetchMock;
  });

  it('returns the body and sends the configured User-Agent', async () => {
    fetchMock.mockResolvedValue(response(200, '<html>ok</html>'));

    await expect(buildFetcher().fetchHtml(REGION_URL)).resolves.toBe('<html>ok</html>');

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect((init.headers as Record<string, string>)['User-Agent']).toBe('ph-geography-api/test');
    expect(init.signal).toBeDefined();
  });

  it('refuses a URL that is not one of the configured sources', async () => {
    await expect(buildFetcher().fetchHtml('https://evil.example/pwn')).rejects.toThrow(
      /outside the source allow-list/,
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('allows both source URLs', async () => {
    fetchMock.mockResolvedValue(response(200));

    await expect(buildFetcher().fetchHtml(CITY_URL)).resolves.toContain('<html>');
  });

  it('retries a transient failure and then succeeds', async () => {
    fetchMock
      .mockRejectedValueOnce(new Error('socket hang up'))
      .mockResolvedValueOnce(response(200, '<html>second</html>'));

    await expect(buildFetcher().fetchHtml(REGION_URL)).resolves.toBe('<html>second</html>');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('retries a 503 but not a 404', async () => {
    fetchMock.mockResolvedValue(response(503));
    await expect(buildFetcher().fetchHtml(REGION_URL)).rejects.toThrow(ScrapeError);
    expect(fetchMock).toHaveBeenCalledTimes(3); // 1 attempt + 2 retries

    fetchMock.mockReset();
    fetchMock.mockResolvedValue(response(404));
    await expect(buildFetcher().fetchHtml(REGION_URL)).rejects.toThrow(/HTTP 404/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('throws a fetch-kind ScrapeError once the retries are exhausted', async () => {
    fetchMock.mockRejectedValue(new Error('timed out'));

    await expect(buildFetcher().fetchHtml(REGION_URL)).rejects.toMatchObject({
      kind: 'fetch',
      message: expect.stringContaining('timed out') as unknown,
    });
  });

  it('treats an empty body as a failure rather than an empty page', async () => {
    // The legacy returned `false` here and the caller read it as "nothing to do".
    fetchMock.mockResolvedValue(response(200, '   '));

    await expect(buildFetcher().fetchHtml(REGION_URL)).rejects.toThrow(/empty body/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
