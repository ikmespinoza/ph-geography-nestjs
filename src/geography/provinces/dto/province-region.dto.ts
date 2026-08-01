import { Exclude, Expose } from 'class-transformer';

import type { Region } from '@/generated/prisma/client';

/**
 * A region nested inside a province response — the province's parent, one level deep.
 * Its own `provinces` are not repeated here (the caller already knows which region it
 * asked for); the full region resource is served by the regions module.
 */
@Exclude()
export class ProvinceRegionDto {
  @Expose()
  readonly code: string;

  @Expose()
  readonly name: string;

  @Expose({ name: 'name_tl' })
  readonly nameTl: string;

  @Expose()
  readonly acronym: string;

  constructor(region: Region) {
    this.code = region.code;
    this.name = region.name;
    this.nameTl = region.nameTl;
    this.acronym = region.acronym;
  }
}
