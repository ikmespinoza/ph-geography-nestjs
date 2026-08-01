import { Exclude, Expose } from 'class-transformer';

import type { Province } from '@/generated/prisma/client';

/**
 * The province a city belongs to, nested one level deep inside a city response.
 *
 * This is the field the legacy `CityResource` got wrong (OD-5): it mapped
 * `'province' => $this->provinces`, a plural relation `City` never declared, so the
 * key came back empty. Here it is the singular `province`, populated from the same
 * region-anchored read that found the city.
 */
@Exclude()
export class CityProvinceDto {
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
