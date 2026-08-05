import { getMetadataStorage } from 'class-validator';

import { ProblemDetailsDto } from '@/common/http/problem-details.dto';
import type { ProblemDetails } from '@/common/http/problem-details';

/**
 * Every member of the `ProblemDetails` contract, listed literally. `ProblemDetailsDto`
 * `implements ProblemDetails`, so TypeScript already catches a member missing from the
 * class — this list catches the other direction, a member added to the interface (and
 * to the class) that nobody documented.
 */
const CONTRACT_MEMBERS: readonly (keyof ProblemDetails)[] = [
  'type',
  'title',
  'status',
  'detail',
  'instance',
  'errors',
];

/** Property names `@ApiProperty`/`@ApiPropertyOptional` recorded on the class. */
function documentedProperties(): string[] {
  const metadata = Reflect.getMetadata(
    'swagger/apiModelPropertiesArray',
    ProblemDetailsDto.prototype,
  ) as string[] | undefined;

  return (metadata ?? []).map((name) => name.replace(/^:/, '')).sort();
}

describe('ProblemDetailsDto', () => {
  it('documents every member of the ProblemDetails contract', () => {
    expect(documentedProperties()).toEqual([...CONTRACT_MEMBERS].sort());
  });

  it('is documentation-only — it declares no validation rules', () => {
    // It shapes a response, never an input, so it must not end up on the ValidationPipe's
    // radar as though a client could send one.
    const validated = getMetadataStorage().getTargetValidationMetadatas(
      ProblemDetailsDto,
      ProblemDetailsDto.name,
      false,
      false,
    );

    expect(validated).toHaveLength(0);
  });
});
