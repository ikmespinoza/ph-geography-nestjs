import { Exclude, Expose } from 'class-transformer';

import type { Region } from '@/generated/prisma/client';

/**
 * A region as it appears in `GET /api/v1/regions`.
 *
 * Shallow by design (OD-3): the list omits `provinces` — drill into
 * `GET /api/v1/regions/{code}` for those. Fields are assigned explicitly rather than
 * copied from the row, so internal columns (`id`, timestamps) can't ride along.
 */
@Exclude()
export class RegionListItemDto {
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
