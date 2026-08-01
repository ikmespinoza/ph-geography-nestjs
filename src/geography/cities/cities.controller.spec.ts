import { CitiesController } from '@/geography/cities/cities.controller';
import type { CitiesService } from '@/geography/cities/cities.service';

function createController(): {
  controller: CitiesController;
  findAllByProvince: jest.Mock;
  findOne: jest.Mock;
} {
  const findAllByProvince = jest.fn();
  const findOne = jest.fn();
  const service = { findAllByProvince, findOne } as unknown as CitiesService;

  return { controller: new CitiesController(service), findAllByProvince, findOne };
}

describe('CitiesController', () => {
  it('passes both path codes to the service and returns its list unchanged', async () => {
    const { controller, findAllByProvince } = createController();
    const cities = [{ name: 'Bislig' }];
    findAllByProvince.mockResolvedValue(cities);

    await expect(controller.findAll('PH-13', 'PH-SUR')).resolves.toBe(cities);
    expect(findAllByProvince).toHaveBeenCalledWith('PH-13', 'PH-SUR');
  });

  it('passes all three params through in region-province-city order', async () => {
    const { controller, findOne } = createController();
    const city = { name: 'Bislig' };
    findOne.mockResolvedValue(city);

    await expect(controller.findOne('PH-13', 'PH-SUR', 'bislig')).resolves.toBe(city);
    expect(findOne).toHaveBeenCalledWith('PH-13', 'PH-SUR', 'bislig');
  });

  it('lets the service error propagate — no controller-level catch to swallow a 404', async () => {
    const { controller, findOne } = createController();
    const failure = new Error('City not found');
    findOne.mockRejectedValue(failure);

    await expect(controller.findOne('PH-13', 'PH-SUR', 'atlantis')).rejects.toBe(failure);
  });
});
