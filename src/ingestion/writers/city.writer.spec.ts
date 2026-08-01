import { Logger } from '@nestjs/common';

import type { CityRow } from '@/ingestion/scraper-core/geo-source';
import { CityWriter } from '@/ingestion/writers/city.writer';
import type { PrismaService } from '@/persistence/prisma.service';

const BUTUAN: CityRow = {
  name: 'Butuan',
  altName: null,
  fullName: 'Butuan City',
  isCapital: false,
  classificationCode: 'HUC',
  provinceName: 'Agusan del Norte',
};

const PATEROS: CityRow = {
  name: 'Pateros',
  altName: null,
  fullName: 'Pateros',
  isCapital: false,
  classificationCode: 'Mun',
  provinceName: 'Metro Manila',
  ncrDistrictCode: 'PH-00-D4',
};

describe('CityWriter', () => {
  const classificationFindMany = jest.fn();
  const provinceFindMany = jest.fn();
  const cityFindMany = jest.fn();
  const create = jest.fn();
  const update = jest.fn();

  const prisma = {
    classification: { findMany: classificationFindMany },
    province: { findMany: provinceFindMany },
    city: { findMany: cityFindMany, create, update },
  } as unknown as PrismaService;
  const writer = new CityWriter(prisma);

  beforeEach(() => {
    jest.resetAllMocks();
    classificationFindMany.mockResolvedValue([
      { id: 1, code: 'Mun' },
      { id: 2, code: 'CC' },
      { id: 3, code: 'ICC' },
      { id: 4, code: 'HUC' },
    ]);
    provinceFindMany.mockResolvedValue([
      { id: 10, code: 'PH-AGN', name: 'Agusan del Norte', altName: null },
      { id: 11, code: 'PH-WSA', name: 'Samar', altName: 'Western Samar' },
      { id: 40, code: 'PH-00-D4', name: 'Southern Manila District', altName: 'Southern Manila' },
    ]);
    cityFindMany.mockResolvedValue([]);
  });

  it('resolves the province by name and creates the city', async () => {
    await expect(writer.write([BUTUAN])).resolves.toMatchObject({ created: 1, rejected: 0 });
    expect(create).toHaveBeenCalledWith({
      data: {
        name: 'Butuan',
        altName: null,
        fullName: 'Butuan City',
        isCapital: false,
        provinceId: 10,
        classificationId: 4,
      },
    });
  });

  it('falls back to the province alt_name, which is how Samar resolves', async () => {
    await writer.write([{ ...BUTUAN, name: 'Catbalogan', provinceName: 'Western Samar' }]);

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ provinceId: 11 }) as unknown }),
    );
  });

  it('routes an NCR city to its district province by code, not by name', async () => {
    await expect(writer.write([PATEROS])).resolves.toMatchObject({ created: 1, rejected: 0 });
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ provinceId: 40 }) as unknown }),
    );
  });

  it('rejects and counts a city whose province cannot be resolved', async () => {
    await expect(
      writer.write([{ ...BUTUAN, name: 'Nowhere', provinceName: 'Atlantis' }]),
    ).resolves.toMatchObject({ created: 0, rejected: 1 });
    expect(create).not.toHaveBeenCalled();
  });

  it('rejects a city with an unknown classification', async () => {
    await expect(writer.write([{ ...BUTUAN, classificationCode: 'XX' }])).resolves.toMatchObject({
      rejected: 1,
    });
  });

  it('writes nothing on a re-run with identical rows', async () => {
    cityFindMany.mockResolvedValue([
      {
        provinceId: 10,
        name: 'Butuan',
        altName: null,
        fullName: 'Butuan City',
        isCapital: false,
        classificationId: 4,
      },
    ]);

    await expect(writer.write([BUTUAN])).resolves.toMatchObject({ unchanged: 1, updated: 0 });
    expect(create).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });

  it('updates a reclassified city on the (province, name) key', async () => {
    // A municipality becoming a component city — exactly what the legacy's
    // insert-only scraper could never propagate.
    cityFindMany.mockResolvedValue([
      {
        provinceId: 10,
        name: 'Cabadbaran',
        altName: null,
        fullName: 'Cabadbaran',
        isCapital: true,
        classificationId: 1,
      },
    ]);

    await expect(
      writer.write([
        {
          name: 'Cabadbaran',
          altName: null,
          fullName: 'Cabadbaran City',
          isCapital: true,
          classificationCode: 'CC',
          provinceName: 'Agusan del Norte',
        },
      ]),
    ).resolves.toMatchObject({ updated: 1, created: 0 });

    expect(update).toHaveBeenCalledWith({
      where: { provinceId_name: { provinceId: 10, name: 'Cabadbaran' } },
      data: { altName: null, fullName: 'Cabadbaran City', isCapital: true, classificationId: 2 },
    });
  });

  it('treats the same name in two provinces as two cities', async () => {
    await writer.write([
      { ...BUTUAN, name: 'San Jose' },
      { ...BUTUAN, name: 'San Jose', provinceName: 'Samar' },
    ]);

    expect(create).toHaveBeenCalledTimes(2);
  });

  it('fails with the real cause when the classification seed has not been run', async () => {
    classificationFindMany.mockResolvedValue([]);

    await expect(writer.write([BUTUAN])).rejects.toThrow(/pnpm db:seed/);
  });

  it('warns when no city is marked a capital — the border signal has moved', async () => {
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);

    await writer.write([BUTUAN]);

    expect(warn).toHaveBeenCalledWith(expect.stringMatching(/no city was marked a capital/));
    warn.mockRestore();
  });

  it('does not warn when the capital count is in the right order of magnitude', async () => {
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);

    // Two capitals against the three stubbed provinces.
    await writer.write([
      { ...BUTUAN, name: 'Cabadbaran', isCapital: true },
      { ...BUTUAN, name: 'Catbalogan', provinceName: 'Samar', isCapital: true },
    ]);

    expect(warn).not.toHaveBeenCalledWith(expect.stringContaining('Capitals:'));
    warn.mockRestore();
  });

  it('reads its lookup tables once, not once per row', async () => {
    await writer.write([BUTUAN, { ...BUTUAN, name: 'Cabadbaran' }]);

    expect(provinceFindMany).toHaveBeenCalledTimes(1);
    expect(cityFindMany).toHaveBeenCalledTimes(1);
    expect(classificationFindMany).toHaveBeenCalledTimes(1);
  });
});
