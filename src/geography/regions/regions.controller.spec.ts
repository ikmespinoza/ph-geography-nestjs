import { RegionsController } from '@/geography/regions/regions.controller';
import type { RegionsService } from '@/geography/regions/regions.service';

function createController(): {
  controller: RegionsController;
  findAll: jest.Mock;
  findOne: jest.Mock;
} {
  const findAll = jest.fn();
  const findOne = jest.fn();
  const service = { findAll, findOne } as unknown as RegionsService;

  return { controller: new RegionsController(service), findAll, findOne };
}

describe('RegionsController', () => {
  it('delegates the list route to the service and returns its result unchanged', async () => {
    const { controller, findAll } = createController();
    const regions = [{ code: 'PH-13' }];
    findAll.mockResolvedValue(regions);

    await expect(controller.findAll()).resolves.toBe(regions);
    expect(findAll).toHaveBeenCalledTimes(1);
  });

  it('passes the path code straight through to the service', async () => {
    const { controller, findOne } = createController();
    const region = { code: 'PH-13' };
    findOne.mockResolvedValue(region);

    await expect(controller.findOne('PH-13')).resolves.toBe(region);
    expect(findOne).toHaveBeenCalledWith('PH-13');
  });

  it('lets the service error propagate — no controller-level catch to swallow a 404', async () => {
    const { controller, findOne } = createController();
    const failure = new Error('Region not found');
    findOne.mockRejectedValue(failure);

    await expect(controller.findOne('PH-99')).rejects.toBe(failure);
  });
});
