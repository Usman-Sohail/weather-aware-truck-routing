import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { App } from './App';

describe('App', () => {
  it('shows the service as online when the health check succeeds', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ status: 'ok' })));

    render(<App />);

    expect(screen.getByRole('heading', { name: 'Weather-Aware Truck Routing' })).toBeVisible();
    expect(await screen.findByText('Service online')).toBeVisible();
  });

  it('shows the service as unavailable when the health check fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));

    render(<App />);

    expect(await screen.findByText('Service unavailable')).toBeVisible();
  });
});
