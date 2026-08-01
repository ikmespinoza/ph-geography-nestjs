import { Controller, Get, Param } from '@nestjs/common';

import { ProvinceDetailDto } from '@/geography/provinces/dto/province-detail.dto';
import { ProvinceListItemDto } from '@/geography/provinces/dto/province-list-item.dto';
import { ProvincesService } from '@/geography/provinces/provinces.service';

/**
 * `/api/v1/regions/{region}/provinces` — provinces are only reachable under their
 * region, mirroring the legacy nested routes. Both params are ISO codes (OD-1),
 * matched exactly; an unknown one becomes a 404 problem document.
 */
@Controller('regions/:region/provinces')
export class ProvincesController {
  constructor(private readonly provincesService: ProvincesService) {}

  @Get()
  findAll(@Param('region') region: string): Promise<ProvinceListItemDto[]> {
    return this.provincesService.findAllByRegion(region);
  }

  @Get(':province')
  findOne(
    @Param('region') region: string,
    @Param('province') province: string,
  ): Promise<ProvinceDetailDto> {
    return this.provincesService.findOne(region, province);
  }
}
