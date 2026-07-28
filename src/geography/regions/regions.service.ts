import { Injectable } from '@nestjs/common';

import { ResourceNotFoundException } from '@/common/http/resource-not-found.exception';
import { RegionDetailDto } from '@/geography/regions/dto/region-detail.dto';
import { RegionListItemDto } from '@/geography/regions/dto/region-list-item.dto';
import { PrismaService } from '@/persistence/prisma.service';

/**
 * Read-side access to regions. Returns response DTOs rather than Prisma rows so the
 * model types never cross into the controller — the wire contract is owned in one
 * place, and PHG-015 gets a cacheable object.
 */
@Injectable()
export class RegionsService {
  constructor(private readonly prisma: PrismaService) {}

  /** All regions, ordered by `name` (legacy `Region::orderBy('name')`). */
  async findAll(): Promise<RegionListItemDto[]> {
    const regions = await this.prisma.region.findMany({ orderBy: { name: 'asc' } });

    return regions.map((region) => new RegionListItemDto(region));
  }

  /**
   * One region addressed by its ISO `code` (OD-1), with its provinces eager-loaded in
   * the same query — no N+1. Provinces are ordered by name; the legacy `hasMany` left
   * them at whatever order the database returned.
   */
  async findOne(code: string): Promise<RegionDetailDto> {
    const region = await this.prisma.region.findUnique({
      where: { code },
      include: { provinces: { orderBy: { name: 'asc' } } },
    });

    if (!region) {
      throw new ResourceNotFoundException('Region', code);
    }

    return new RegionDetailDto(region);
  }
}
