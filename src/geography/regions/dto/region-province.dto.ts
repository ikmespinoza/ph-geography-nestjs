import { Exclude, Expose } from 'class-transformer';

import type { Province } from '@/generated/prisma/client';

/**
 * A province nested inside a region detail response. One level deep only — its
 * `cities` and its back-reference to the region are not repeated here. The full
 * province resource is served by the provinces module (PHG-008).
 */
@Exclude()
export class RegionProvinceDto {
  @Expose()
  readonly code: string;

  @Expose()
  readonly name: string;

  @Expose({ name: 'alt_name' })
  readonly altName: string | null;

  @Expose({ name: 'name_tl' })
  readonly nameTl: string;

  constructor(province: Province) {
    this.code = province.code;
    this.name = province.name;
    this.altName = province.altName;
    this.nameTl = province.nameTl;
  }
}
