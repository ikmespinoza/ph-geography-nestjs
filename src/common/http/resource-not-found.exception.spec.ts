import { HttpStatus, NotFoundException } from '@nestjs/common';

import { ResourceNotFoundException } from '@/common/http/resource-not-found.exception';

describe('ResourceNotFoundException', () => {
  it('is a 404 — the legacy answered 200 for the same miss', () => {
    const exception = new ResourceNotFoundException('Region', 'PH-99');

    expect(exception).toBeInstanceOf(NotFoundException);
    expect(exception.getStatus()).toBe(HttpStatus.NOT_FOUND);
  });

  it('names the resource and the identifier that missed', () => {
    expect(new ResourceNotFoundException('Province', 'PH-AGN').message).toBe(
      "Province 'PH-AGN' was not found.",
    );
    expect(new ResourceNotFoundException('City', 'butuan').message).toBe(
      "City 'butuan' was not found.",
    );
  });
});
