import { Exclude, Expose } from 'class-transformer';

import type { Region } from '@/generated/prisma/client';

/**
 * A region without its children — the canonical region shape (PHG-010).
 *
 * One class covers every place a bare region appears: each item of
 * `GET /api/v1/regions`, and the `region` nested inside a province. They are the same
 * shape by definition, and were the same object in the legacy too — its nested
 * `region` and its `regions.index` items are both a raw `Region` model serialized
 * through `$hidden`, so a single class is the faithful port rather than merely a
 * de-duplication.
 *
 * Shallow by design (OD-3): `provinces` are omitted — drill into
 * `GET /api/v1/regions/{code}` for those. Fields are assigned explicitly rather than
 * copied from the row, so internal columns (`id`, timestamps) cannot ride along even
 * if the model gains one.
 */
@Exclude()
export class RegionSummaryDto {
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
