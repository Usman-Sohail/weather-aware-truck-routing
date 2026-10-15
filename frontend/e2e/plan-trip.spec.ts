import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';

import { failWith, mockServices } from './mocks';

async function planTrip(page: Page) {
  await page.goto('/');
  await page.getByLabel('Starting place').fill('Denver');
  await page.getByLabel('Starting place').press('Enter');
  await expect(page.getByLabel('Starting place')).toHaveValue('Denver, CO, United States');
  await page.getByLabel('Destination').fill('Chicago');
  await page.getByLabel('Destination').press('Enter');
  await expect(page.getByLabel('Destination')).toHaveValue('Chicago, IL, United States');
  await page.getByLabel('Cargo weight').fill('42000');
  await page.getByRole('button', { name: 'Compare routes' }).click();
}

// The map draws asynchronously, so wait until two captures in a row agree.
async function settledImage(locator: Locator): Promise<Buffer> {
  let previous = await locator.screenshot();
  for (let attempt = 0; attempt < 20; attempt += 1) {
    await locator.page().waitForTimeout(250);
    const current = await locator.screenshot();
    if (current.equals(previous)) return current;
    previous = current;
  }
  return previous;
}

test('plans a trip to a recommendation drawn on the map', async ({ page }) => {
  await mockServices(page);

  await planTrip(page);

  await expect(page.getByRole('heading', { name: 'Take Route B' })).toBeVisible();
  await expect(page.getByRole('radio', { name: /^Route [ABC]:/ })).toHaveCount(3);
  await expect(page.locator('canvas.maplibregl-canvas')).toBeVisible();
  await expect(page.getByText('Weather risk')).toBeVisible();
  await expect(page.getByRole('slider', { name: 'Forecast hour' })).toHaveValue('0');
});

test('moves through the forecast hours without touching the network', async ({ page }) => {
  await mockServices(page);
  await planTrip(page);
  await expect(page.getByRole('heading', { name: 'Take Route B' })).toBeVisible();
  const map = page.getByRole('region', { name: 'Route map' });
  const before = await settledImage(map);
  const requests: string[] = [];
  page.on('request', (request) => requests.push(request.url()));

  await page.getByRole('slider', { name: 'Forecast hour' }).focus();
  await page.keyboard.press('PageUp');
  await page.keyboard.press('PageUp');

  await expect(page.getByText('Departure + 12 h')).toBeVisible();
  expect((await settledImage(map)).equals(before)).toBe(false);
  expect(requests).toEqual([]);
});

test('explains why a trip could not be planned', async ({ page }) => {
  await mockServices(page, {
    routes: failWith(
      { error: { code: 'NO_ROUTE', message: 'No truck route was found between these places.' } },
      422,
    ),
  });

  await planTrip(page);

  await expect(page.getByRole('alert')).toHaveText(
    'No truck route was found between these places.',
  );
  await expect(page.getByLabel('Starting place')).toBeVisible();
});
