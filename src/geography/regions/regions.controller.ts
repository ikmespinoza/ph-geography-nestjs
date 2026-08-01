import { Controller, Get, Param } from '@nestjs/common';

import { RegionSummaryDto } from '@/geography/dto/region-summary.dto';
import { RegionDetailDto } from '@/geography/regions/dto/region-detail.dto';
import { RegionsService } from '@/geography/regions/regions.service';

/**
 * `/api/v1/regions` — the global prefix and URI version are applied in `main.ts`.
 * `:code` is the ISO region code (OD-1), matched exactly; an unknown one becomes a
 * 404 problem document via `ResourceNotFoundException`.
 */
@Controller('regions')
export class RegionsController {
  constructor(private readonly regionsService: RegionsService) {}

  @Get()
  findAll(): Promise<RegionSummaryDto[]> {
    return this.regionsService.findAll();
  }

  @Get(':code')
  findOne(@Param('code') code: string): Promise<RegionDetailDto> {
    return this.regionsService.findOne(code);
  }
}
