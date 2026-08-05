import { Controller, Get, Param } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';

import {
  ApiNotFoundProblem,
  ApiProblemResponses,
} from '@/common/http/api-problem-responses.decorator';
import { SLUG_RULE_DESCRIPTION } from '@/common/text/slug.util';
import { CitiesService } from '@/geography/cities/cities.service';
import { CityDto } from '@/geography/cities/dto/city.dto';

/** Documented once — both routes take both, and both 404 on either. */
const REGION_PARAM = {
  name: 'region',
  description: 'ISO 3166-2 region code, matched exactly (case-sensitive).',
  example: 'PH-13',
};

const PROVINCE_PARAM = {
  name: 'province',
  description: 'ISO 3166-2 province code, matched exactly. It must belong to `region`.',
  example: 'PH-SUR',
};

/**
 * `/api/v1/regions/{region}/provinces/{province}/cities` — cities are only reachable
 * under their province, mirroring the legacy nested routes. `region` and `province`
 * are ISO codes (OD-1) and `city` is a slug of the city's name; all three are matched
 * exactly, and an unknown one becomes a 404 problem document.
 */
@ApiTags('Cities')
@Controller('regions/:region/provinces/:province/cities')
export class CitiesController {
  constructor(private readonly citiesService: CitiesService) {}

  @Get()
  @ApiOperation({
    summary: "List a province's cities and municipalities",
    description: 'Ordered by name, each carrying its classification and its province.',
  })
  @ApiParam(REGION_PARAM)
  @ApiParam(PROVINCE_PARAM)
  @ApiOkResponse({ type: [CityDto] })
  @ApiNotFoundProblem('No such region, or no province with that code inside it.')
  @ApiProblemResponses()
  findAll(
    @Param('region') region: string,
    @Param('province') province: string,
  ): Promise<CityDto[]> {
    return this.citiesService.findAllByProvince(region, province);
  }

  @Get(':city')
  @ApiOperation({
    summary: 'Get one city or municipality',
    description:
      'The same shape the list returns — a city detail and a city list item are identical by design. This endpoint did not exist in the legacy API (OD-4).',
  })
  @ApiParam(REGION_PARAM)
  @ApiParam(PROVINCE_PARAM)
  @ApiParam({
    name: 'city',
    description: `Slug of the city's name, unique within the province. ${SLUG_RULE_DESCRIPTION}`,
    example: 'bislig',
  })
  @ApiOkResponse({ type: CityDto })
  @ApiNotFoundProblem('No such region or province, or no city in it with that slug.')
  @ApiProblemResponses()
  findOne(
    @Param('region') region: string,
    @Param('province') province: string,
    @Param('city') city: string,
  ): Promise<CityDto> {
    return this.citiesService.findOne(region, province, city);
  }
}
