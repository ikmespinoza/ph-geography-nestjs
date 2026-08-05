import { Controller, Get, Param } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';

import {
  ApiNotFoundProblem,
  ApiProblemResponses,
} from '@/common/http/api-problem-responses.decorator';
import { ProvinceDetailDto } from '@/geography/provinces/dto/province-detail.dto';
import { ProvinceListItemDto } from '@/geography/provinces/dto/province-list-item.dto';
import { ProvincesService } from '@/geography/provinces/provinces.service';

/** Documented once — both routes take it and both 404 on it. */
const REGION_PARAM = {
  name: 'region',
  description: 'ISO 3166-2 region code, matched exactly (case-sensitive).',
  example: 'PH-13',
};

/**
 * `/api/v1/regions/{region}/provinces` — provinces are only reachable under their
 * region, mirroring the legacy nested routes. Both params are ISO codes (OD-1),
 * matched exactly; an unknown one becomes a 404 problem document.
 */
@ApiTags('Provinces')
@Controller('regions/:region/provinces')
export class ProvincesController {
  constructor(private readonly provincesService: ProvincesService) {}

  @Get()
  @ApiOperation({
    summary: "List a region's provinces",
    description:
      'Ordered by name, each carrying its parent region. Cities are not nested here — drill into a province for those.',
  })
  @ApiParam(REGION_PARAM)
  @ApiOkResponse({ type: [ProvinceListItemDto] })
  @ApiNotFoundProblem('No region carries that code.')
  @ApiProblemResponses()
  findAll(@Param('region') region: string): Promise<ProvinceListItemDto[]> {
    return this.provincesService.findAllByRegion(region);
  }

  @Get(':province')
  @ApiOperation({
    summary: 'Get one province',
    description:
      'The province plus its region and its cities, each city carrying its classification.',
  })
  @ApiParam(REGION_PARAM)
  @ApiParam({
    name: 'province',
    description:
      'ISO 3166-2 province code, matched exactly. It must belong to `region` — a province filed under another region is a 404, not a redirect.',
    example: 'PH-AGN',
  })
  @ApiOkResponse({ type: ProvinceDetailDto })
  @ApiNotFoundProblem('No such region, or no province with that code inside it.')
  @ApiProblemResponses()
  findOne(
    @Param('region') region: string,
    @Param('province') province: string,
  ): Promise<ProvinceDetailDto> {
    return this.provincesService.findOne(region, province);
  }
}
