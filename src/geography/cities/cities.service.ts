import { Injectable } from '@nestjs/common';

import { ResourceNotFoundException } from '@/common/http/resource-not-found.exception';
import { slugify } from '@/common/text/slug.util';
import { CityDto } from '@/geography/cities/dto/city.dto';
import type { City, Classification, Province } from '@/generated/prisma/client';
import { PrismaService } from '@/persistence/prisma.service';

/** A province row with the cities and classifications both reads need eager-loaded. */
type ProvinceWithCities = Province & {
  cities: (City & { classification: Classification })[];
};

/**
 * Read-side access to cities and municipalities, always addressed under
 * region → province.
 *
 * Both reads share one region-anchored query, for the reasons the provinces module
 * anchors on the region: it makes the legacy's double scoping structural (a province
 * filed under another region cannot answer), it names the right resource in a 404, and
 * it stays a single eager-loaded call. `classification` and `province` come back with
 * the cities, so neither route can N+1.
 */
@Injectable()
export class CitiesService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Every city in a province, ordered by `name` (legacy `orderBy('cities.name')`),
   * each with its classification and its province.
   */
  async findAllByProvince(regionCode: string, provinceCode: string): Promise<CityDto[]> {
    const province = await this.findProvinceWithCities(regionCode, provinceCode);

    return province.cities.map((city) => new CityDto(city, province));
  }

  /**
   * One city addressed by a slug of its `name` (OD-1 — cities have no ISO code),
   * scoped to the province and region in the path.
   *
   * This endpoint did not exist before: `CityController::show()` was an empty stub
   * (OD-4). The slug is matched against the province's cities in memory rather than in
   * SQL because it is derived, not stored — a province holds at most a few dozen
   * cities and they are already loaded. Names are unique within a province, so at most
   * one city can match unless two names slug identically, in which case the first in
   * `name` order wins deterministically.
   */
  async findOne(regionCode: string, provinceCode: string, citySlug: string): Promise<CityDto> {
    const province = await this.findProvinceWithCities(regionCode, provinceCode);
    const city = province.cities.find((candidate) => slugify(candidate.name) === citySlug);

    if (!city) {
      throw new ResourceNotFoundException('City', citySlug);
    }

    return new CityDto(city, province);
  }

  /**
   * The province both routes hang off, with its cities ordered by name. Throws the
   * 404 that names whichever link of region → province actually missed.
   */
  private async findProvinceWithCities(
    regionCode: string,
    provinceCode: string,
  ): Promise<ProvinceWithCities> {
    const region = await this.prisma.region.findUnique({
      where: { code: regionCode },
      include: {
        provinces: {
          where: { code: provinceCode },
          include: {
            cities: { orderBy: { name: 'asc' }, include: { classification: true } },
          },
        },
      },
    });

    if (!region) {
      throw new ResourceNotFoundException('Region', regionCode);
    }

    const [province] = region.provinces;

    if (!province) {
      throw new ResourceNotFoundException('Province', provinceCode);
    }

    return province;
  }
}
