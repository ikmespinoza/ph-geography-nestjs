import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { DEFAULT_PROBLEM_TYPE } from '@/common/http/problem-details';
import type { ProblemDetails } from '@/common/http/problem-details';

/**
 * Documentation-only mirror of the {@link ProblemDetails} interface (PHG-016).
 *
 * `ProblemDetailsFilter` builds plain objects, not instances of this class — Swagger
 * simply needs a class to hang schema metadata on, since an interface leaves no
 * runtime trace. It implements `ProblemDetails`, so adding a member to the contract
 * without documenting it here is a compile error rather than a silent doc gap, and
 * `problem-details.dto.spec.ts` checks the reverse direction.
 */
export class ProblemDetailsDto implements ProblemDetails {
  @ApiProperty({
    description: 'URI identifying the problem type; `about:blank` when the status says it all.',
    example: DEFAULT_PROBLEM_TYPE,
  })
  readonly type!: string;

  @ApiProperty({ description: 'The HTTP status phrase.', example: 'Not Found' })
  readonly title!: string;

  @ApiProperty({ description: 'The HTTP status code, repeated in the body.', example: 404 })
  readonly status!: number;

  @ApiProperty({
    description: 'Human-readable explanation specific to this occurrence.',
    example: "Region 'PH-99' was not found.",
  })
  readonly detail!: string;

  @ApiProperty({
    description: 'URI reference identifying this occurrence — the request path.',
    example: '/api/v1/regions/PH-99',
  })
  readonly instance!: string;

  @ApiPropertyOptional({
    type: [String],
    description: 'Per-constraint validation messages. Present only on validation failures.',
  })
  readonly errors?: string[];
}
