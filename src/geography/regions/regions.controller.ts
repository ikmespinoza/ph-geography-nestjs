import { Controller, Get, Param } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';

import {
  ApiNotFoundProblem,
  ApiProblemResponses,
} from '@/common/http/api-problem-responses.decorator';
import { RegionSummaryDto } from '@/geography/dto/region-summary.dto';
import { RegionDetailDto } from '@/geography/regions/dto/region-detail.dto';
import { RegionsService } from '@/geography/regions/regions.service';

/**
 * `/api/v1/regions` — the global prefix and URI version are applied in `main.ts`.
 * `:code` is the ISO region code (OD-1), matched exactly; an unknown one becomes a
 * 404 problem document via `ResourceNotFoundException`.
 */
@ApiTags('Regions')
@Controller('regions')
export class RegionsController {
  constructor(private readonly regionsService: RegionsService) {}

  @Get()
  @ApiOperation({
    summary: 'List all regions',
    description: 'Every administrative region, ordered by name. Provinces are not nested here.',
  })
  @ApiOkResponse({ type: [RegionSummaryDto] })
  // No 404: an empty database answers `[]`, not a miss.
  @ApiProblemResponses()
  findAll(): Promise<RegionSummaryDto[]> {
    return this.regionsService.findAll();
  }

  @Get(':code')
  @ApiOperation({
    summary: 'Get one region',
    description: 'The region plus its provinces, ordered by name.',
  })
  @ApiParam({
    name: 'code',
    description: 'ISO 3166-2 region code, matched exactly (case-sensitive).',
    example: 'PH-13',
  })
  @ApiOkResponse({ type: RegionDetailDto })
  @ApiNotFoundProblem('No region carries that code.')
  @ApiProblemResponses()
  findOne(@Param('code') code: string): Promise<RegionDetailDto> {
    return this.regionsService.findOne(code);
  }
}
