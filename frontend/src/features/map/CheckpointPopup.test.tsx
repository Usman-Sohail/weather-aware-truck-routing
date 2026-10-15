import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { readable } from '../../test/text';
import type { CheckpointAssessment } from '../../types/api';
import type { CheckpointView } from '../results/model';
import { testCheckpoint } from '../results/testRoutes';
import { CheckpointPopup } from './CheckpointPopup';

function checkpoint(overrides: Partial<CheckpointAssessment> = {}): CheckpointView {
  return {
    ...testCheckpoint('B', 17, 425.4, 'severe', {
      forecast_hour_utc: '2026-10-16T09:00:00Z',
      lead_hours: 9,
      weather: { gust_mph: 41, wind_mph: 24.5, rain_in_hr: 0.12, snow_in_hr: 0 },
      levels: { wind: 'severe', rain: 'moderate', snow: 'low' },
      reasons: [
        'Gust 41 mph with 42,000 lb load → Severe (load rule)',
        'Rain 0.12 in/hr → Moderate',
      ],
      ...overrides,
    }),
    eta_utc: '2026-10-16T08:20:00Z',
  };
}

function renderPopup(view = checkpoint(), timeZone = 'America/Chicago') {
  render(<CheckpointPopup checkpoint={view} routeId="B" timeZone={timeZone} />);
  return screen.getByRole('region', { name: 'Route B, mile 425' });
}

function hazards() {
  return screen
    .getAllByRole('term')
    .map((term) => [
      term.textContent,
      ...[...(term.parentElement?.querySelectorAll('dd') ?? [])].map((detail) =>
        readable(detail.textContent),
      ),
    ]);
}

describe('CheckpointPopup', () => {
  it('names the checkpoint and when the truck gets there, in the trip time zone', () => {
    renderPopup();

    expect(screen.getByRole('heading', { name: 'Route B, mile 425' })).toBeVisible();
    expect(screen.getByText('Arrives Fri, 3:20 AM CDT')).toBeVisible();
  });

  it('shows the overall risk as a badge with its road-sign glyph', () => {
    const popup = renderPopup();

    const [overall] = within(popup).getAllByText('Severe');
    expect(overall).toBeVisible();
    expect(overall?.closest('dl')).toBeNull();
    expect(overall?.querySelector('[data-glyph="octagon"]')).toBeInTheDocument();
  });

  it('says which forecast hour applies and how far ahead it looks', () => {
    const popup = renderPopup();

    expect(readable(popup.textContent)).toContain('Forecast for 3 AM to 4 AM, 9 hours ahead');
  });

  it.each([
    [0, 'less than an hour ahead'],
    [1, '1 hour ahead'],
  ])('describes a forecast %i hours ahead as "%s"', (leadHours, text) => {
    const popup = renderPopup(checkpoint({ lead_hours: leadHours }));

    expect(readable(popup.textContent)).toContain(`Forecast for 3 AM to 4 AM, ${text}`);
  });

  it('keeps the minutes in a zone offset by part of an hour', () => {
    const popup = renderPopup(checkpoint(), 'Asia/Kolkata');

    expect(readable(popup.textContent)).toContain('Forecast for 1:30 PM to 2:30 PM, 9 hours ahead');
  });

  it('lists the readings of each hazard with their units, and the risk from each hazard', () => {
    renderPopup();

    expect(hazards()).toEqual([
      ['Wind', 'Gust 41 mphSustained 24.5 mph', 'Severe'],
      ['Rain', '0.12 in/hr', 'Moderate'],
      ['Snowfall', '0 in/hr', 'Low'],
    ]);
  });

  it('explains the level with the reasons from the assessment', () => {
    renderPopup();

    expect(screen.getAllByRole('listitem').map((item) => item.textContent)).toEqual([
      'Gust 41 mph with 42,000 lb load → Severe (load rule)',
      'Rain 0.12 in/hr → Moderate',
    ]);
  });

  it('says "No data" for missing readings and that the risk may be higher', () => {
    renderPopup(
      checkpoint({
        weather: { gust_mph: 41, wind_mph: null, rain_in_hr: 0.12, snow_in_hr: null },
        levels: { wind: 'severe', rain: 'moderate', snow: 'unknown' },
        complete: false,
        reasons: ['Snowfall forecast unavailable'],
      }),
    );

    expect(hazards()).toEqual([
      ['Wind', 'Gust 41 mphSustained No data', 'Severe'],
      ['Rain', '0.12 in/hr', 'Moderate'],
      ['Snowfall', 'No data', 'No forecast'],
    ]);
    expect(
      screen.getByText('Some readings are missing, so the risk may be higher than shown.'),
    ).toBeVisible();
  });

  it('says so when no level could be assessed', () => {
    renderPopup(
      checkpoint({
        weather: { gust_mph: null, wind_mph: null, rain_in_hr: null, snow_in_hr: null },
        levels: { wind: 'unknown', rain: 'unknown', snow: 'unknown' },
        level: 'unknown',
        complete: false,
        reasons: [
          'Wind gust forecast unavailable',
          'Rain forecast unavailable',
          'Snowfall forecast unavailable',
        ],
      }),
    );

    expect(
      screen.getByText('The forecast is missing the readings needed to assess this checkpoint.'),
    ).toBeVisible();
    expect(screen.queryByText(/may be higher/)).not.toBeInTheDocument();
  });

  it('shows neither reasons nor a note for a calm checkpoint with every reading', () => {
    renderPopup(
      checkpoint({
        weather: { gust_mph: 12, wind_mph: 6, rain_in_hr: 0, snow_in_hr: 0 },
        levels: { wind: 'low', rain: 'low', snow: 'low' },
        level: 'low',
        complete: true,
        reasons: [],
      }),
    );

    expect(screen.queryByRole('list')).not.toBeInTheDocument();
    expect(screen.queryByText(/missing/)).not.toBeInTheDocument();
    expect(hazards()).toEqual([
      ['Wind', 'Gust 12 mphSustained 6 mph', 'Low'],
      ['Rain', '0 in/hr', 'Low'],
      ['Snowfall', '0 in/hr', 'Low'],
    ]);
  });
});
