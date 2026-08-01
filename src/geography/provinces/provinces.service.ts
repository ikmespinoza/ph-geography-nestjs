import { Injectable } from '@nestjs/common';

import { ResourceNotFoundException } from '@/common/http/resource-not-found.exception';
import { ProvinceDetailDto } from '@/geography/provinces/dto/province-detail.dto';
import { ProvinceListItemDto } from '@/geography/provinces/dto/province-list-item.dto';
import { PrismaService } from '@/persistence/prisma.service';

/**
 * Read-side access to provinces, which are always addressed under their region.
 *
 * Both reads anchor on the region rather than querying provinces directly: it makes
 * the region-scoping the legacy enforced with a second `where` clause structural — a
 * province belonging to another region simply cannot appear in the result — it yields
 * an accurate 404 when the region itself is unknown, and it keeps each read to one
 * eager-loaded `findUnique` (no N+1). Like the regions module, the service returns
 * DTOs, so Prisma model types never cross into the controller.
 */
@Injectable()
export class ProvincesService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Every province in a region, ordered by `name` (legacy
   * `orderBy('provinces.name')`), each carrying its region. An unknown region code is
   * a 404; the legacy answered 200 with an empty list.
   */
  async findAllByRegion(regionCode: string): Promise<ProvinceListItemDto[]> {
    const region = await this.prisma.region.findUnique({
      where: { code: regionCode },
      include: { provinces: { orderBy: { name: 'asc' } } },
    });

    if (!region) {
      throw new ResourceNotFoundException('Region', regionCode);
    }

    return region.provinces.map((province) => new ProvinceListItemDto(province, region));
  }

  /**
   * One province addressed by its ISO `code` (OD-1) and scoped to the region in the
   * path, with its region and its cities — each with its classification — eager-loaded
   * in the same read. Cities are ordered by name, matching the ordering the legacy
   * applied to its own cities listing; the lazy-loaded `hasMany` behind the legacy
   * province detail left them at whatever order the database returned.
   *
   * A province that exists but sits under a different region is a miss, matching the
   * legacy `where('region_id', $region)` scoping.
   */
  async findOne(regionCode: string, provinceCode: string): Promise<ProvinceDetailDto> {
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

    return new ProvinceDetailDto(province, region);
  }
}
