import type { Page, Route } from '@playwright/test';

import { ASSESSMENT, BASEMAP, CHICAGO, DENVER, PLAN } from './fixtures';

type Responder = (route: Route) => Promise<void>;

const json =
  (body: unknown, status = 200): Responder =>
  (route) =>
    route.fulfill({ status, json: body, headers: { 'Access-Control-Allow-Origin': '*' } });

// Answers every request the app makes, so tests never reach the backend, the providers or
// the basemap.
export async function mockServices(
  page: Page,
  { routes = json(PLAN) }: { routes?: Responder } = {},
) {
  await page.route('**/api/health', json({ status: 'ok' }));
  await page.route('**/api/geocode?**', (route) => {
    const query = new URL(route.request().url()).searchParams.get('q') ?? '';
    return json({ candidates: [query.startsWith('Chi') ? CHICAGO : DENVER] })(route);
  });
  await page.route('**/api/routes', routes);
  await page.route('https://api.open-meteo.com/**', json([]));
  await page.route('**/api/assess', json(ASSESSMENT));
  await page.route('https://tiles.openfreemap.org/styles/**', json(BASEMAP));
  await page.route('https://tiles.openfreemap.org/fonts/**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/x-protobuf', body: '' }),
  );
}

export const failWith = json;
