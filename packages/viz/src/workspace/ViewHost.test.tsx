import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '../i18n/I18nProvider.tsx';
import { vizMessages } from '../i18n/messages.ts';
import { fakeView } from './testViews.tsx';
import type { ReactViewManifest } from './viewTypes.ts';
import { ViewHost } from './ViewHost.tsx';

afterEach(() => vi.restoreAllMocks());

const renderHost = (manifest: ReactViewManifest) =>
  render(
    <I18nProvider messages={{ ...vizMessages.en, 'view.broken.title': 'Broken' }}>
      <ViewHost manifest={manifest} labId="lab" lens="engineer" />
    </I18nProvider>,
  );

describe('ViewHost', () => {
  it('shows a loading status, then the lazily loaded view with ViewProps', async () => {
    renderHost(fakeView('state'));
    expect(screen.getByRole('status').textContent).toBe('Loading view…');
    expect(await screen.findByText('view state (lab/engineer)')).toBeTruthy();
  });

  it('isolates a failing load and retries on reset', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const working = fakeView('broken');
    const load = vi.fn<ReactViewManifest['load']>().mockRejectedValueOnce(new Error('chunk failed')).mockImplementation(working.load);
    renderHost({ ...working, load });

    expect((await screen.findByRole('alert')).textContent).toContain('The view “Broken” could not be displayed.');
    await userEvent.click(screen.getByRole('button', { name: 'Reset view' }));
    expect(await screen.findByText('view broken (lab/engineer)')).toBeTruthy();
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('catches render errors of the view itself', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const Crash = () => {
      throw new Error('render failed');
    };
    renderHost({ ...fakeView('broken'), load: () => Promise.resolve({ default: Crash }) });
    expect(await screen.findByRole('alert')).toBeTruthy();
  });
});
