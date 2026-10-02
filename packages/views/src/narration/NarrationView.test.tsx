import { act, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { createFixtureBundle, fixtureMessages, renderLab } from '@cryventure/viz/testing';
import { loadVizMessages } from '@cryventure/viz/messages';
import { loadViewMessages } from '../messages.ts';
import NarrationView from './NarrationView.tsx';

const live = () => document.querySelector('[aria-live="polite"]');

describe('NarrationView', () => {
  it('announces the initial-state hint, then translated narration with params', () => {
    const { store } = renderLab(<NarrationView labId="fixture" lens="story" />, { bundle: createFixtureBundle(), messages: { ...loadViewMessages('en'), ...fixtureMessages } });
    expect(live()?.textContent).toBe('This is the initial state. Press Play or step forward to begin.');
    act(() => store.getState().seek(1));
    expect(live()?.textContent).toBe('Substitute 2 bytes');
  });

  it('shows the scope path of the current step', () => {
    const { store } = renderLab(<NarrationView labId="fixture" lens="story" />, { bundle: createFixtureBundle(), messages: { ...loadViewMessages('en'), ...fixtureMessages } });
    act(() => store.getState().seek(2));
    expect(screen.getByText('Round 1 · op 2')).toBeTruthy();
    expect(live()?.textContent).toBe('Mix one word');
  });

  it('renders German', () => {
    const { store } = renderLab(<NarrationView labId="fixture" lens="story" />, {
      bundle: createFixtureBundle(),
      messages: { ...loadVizMessages('de'), ...loadViewMessages('de'), 'fixture.narration.load': 'Block laden' },
    });
    expect(screen.getByRole('region', { name: 'Erläuterung' })).toBeTruthy();
    act(() => store.getState().seek(0));
    expect(live()?.textContent).toBe('Block laden');
    expect(screen.getByText('Runde 0 · Operation 1')).toBeTruthy();
  });

  it('handles bundles without narration and steps without entries', () => {
    const bundle = createFixtureBundle();
    const { store } = renderLab(<NarrationView labId="fixture" lens="story" />, { bundle: { ...bundle, facets: { 'state@default': bundle.facets['state@default'] } }, messages: loadViewMessages('en') });
    act(() => store.getState().seek(0));
    expect(live()?.textContent).toBe('This lab has no narration.');

    const sparse = { kind: 'narration', schemaVersion: 1, entries: [{ step: 0, ref: { key: 'fixture.narration.load' } }] };
    act(() => store.getState().setBundle({ ...bundle, facets: { ...bundle.facets, 'narration@default': sparse } }));
    act(() => store.getState().seek(1));
    expect(live()?.textContent).toBe('Nothing to explain for this step.');
  });
});
