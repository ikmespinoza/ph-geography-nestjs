import { ProvincesController } from '@/geography/provinces/provinces.controller';
import type { ProvincesService } from '@/geography/provinces/provinces.service';

function createController(): {
  controller: ProvincesController;
  findAllByRegion: jest.Mock;
  findOne: jest.Mock;
} {
  const findAllByRegion = jest.fn();
  const findOne = jest.fn();
  const service = { findAllByRegion, findOne } as unknown as ProvincesService;

  return { controller: new ProvincesController(service), findAllByRegion, findOne };
}

describe('ProvincesController', () => {
  it('passes the region code to the service and returns its list unchanged', async () => {
    const { controller, findAllByRegion } = createController();
    const provinces = [{ code: 'PH-AGN' }];
    findAllByRegion.mockResolvedValue(provinces);

    await expect(controller.findAll('PH-13')).resolves.toBe(provinces);
    expect(findAllByRegion).toHaveBeenCalledWith('PH-13');
  });

  it('passes both path codes through in region-then-province order', async () => {
    const { controller, findOne } = createController();
    const province = { code: 'PH-AGN' };
    findOne.mockResolvedValue(province);

    await expect(controller.findOne('PH-13', 'PH-AGN')).resolves.toBe(province);
    expect(findOne).toHaveBeenCalledWith('PH-13', 'PH-AGN');
  });

  it('lets the service error propagate — no controller-level catch to swallow a 404', async () => {
    const { controller, findOne } = createController();
    const failure = new Error('Province not found');
    findOne.mockRejectedValue(failure);

    await expect(controller.findOne('PH-13', 'PH-XXX')).rejects.toBe(failure);
  });
});
