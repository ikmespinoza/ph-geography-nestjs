import { Controller, Get, Param } from '@nestjs/common';

import { CitiesService } from '@/geography/cities/cities.service';
import { CityDto } from '@/geography/cities/dto/city.dto';

/**
 * `/api/v1/regions/{region}/provinces/{province}/cities` — cities are only reachable
 * under their province, mirroring the legacy nested routes. `region` and `province`
 * are ISO codes (OD-1) and `city` is a slug of the city's name; all three are matched
 * exactly, and an unknown one becomes a 404 problem document.
 */
@Controller('regions/:region/provinces/:province/cities')
export class CitiesController {
  constructor(private readonly citiesService: CitiesService) {}

  @Get()
  findAll(
    @Param('region') region: string,
    @Param('province') province: string,
  ): Promise<CityDto[]> {
    return this.citiesService.findAllByProvince(region, province);
  }

  @Get(':city')
  findOne(
    @Param('region') region: string,
    @Param('province') province: string,
    @Param('city') city: string,
  ): Promise<CityDto> {
    return this.citiesService.findOne(region, province, city);
  }
}
