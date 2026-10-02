import { act, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import type { AnyStateFacet } from '@cryventure/core';
import { createFixtureBundle } from '../testing/fixtureBundle.ts';
import { renderLab } from '../testing/renderLab.tsx';
import { Controls } from './Controls.tsx';

const button = (name: string) => screen.getByRole('button', { name }) as HTMLButtonElement;

describe('Controls', () => {
  it('labels every control and disables impossible moves', () => {
    renderLab(<Controls />, { bundle: createFixtureBundle() });
    expect(screen.getByRole('group', { name: 'Playback controls' })).toBeTruthy();
    expect(button('Go to start').disabled).toBe(true);
    expect(button('Previous step').disabled).toBe(true);
    expect(button('Next step').disabled).toBe(false);
    expect(button('Go to end').getAttribute('aria-keyshortcuts')).toBe('End');
  });

  it('steps, jumps and toggles play/pause', async () => {
    const user = userEvent.setup();
    const { store } = renderLab(<Controls />, { bundle: createFixtureBundle() });
    await user.click(button('Next step'));
    expect(store.getState().step).toBe(0);
    await user.click(button('Go to end'));
    expect(store.getState().step).toBe(2);
    expect(button('Next step').disabled).toBe(true);
    await user.click(button('Previous step'));
    expect(store.getState().step).toBe(1);
    await user.click(button('Go to start'));
    expect(store.getState().step).toBe(-1);
    await user.click(button('Play'));
    expect(store.getState().playing).toBe(true);
    await user.click(button('Pause'));
    expect(store.getState().playing).toBe(false);
  });

  it('changes speed through a labelled select', async () => {
    const user = userEvent.setup();
    const { store } = renderLab(<Controls />, { bundle: createFixtureBundle() });
    const select = screen.getByRole('combobox', { name: 'Speed' });
    expect(screen.getByRole('option', { name: '2×' })).toBeTruthy();
    await user.selectOptions(select, '2');
    expect(store.getState().speed).toBe(2);
  });

  it('cannot play an empty timeline', () => {
    const { store } = renderLab(<Controls />);
    expect(button('Play').disabled).toBe(true);
    act(() => store.getState().setBundle(createFixtureBundle()));
    expect(button('Play').disabled).toBe(false);
  });

  it('shows section buttons only in debugger mode (the default)', () => {
    const { store } = renderLab(<Controls />, { bundle: createFixtureBundle() });
    expect(store.getState().mode).toBe('debugger');
    expect(button('Previous section').getAttribute('aria-keyshortcuts')).toBe('Shift+ArrowLeft');
    expect(button('Next section').getAttribute('aria-keyshortcuts')).toBe('Shift+ArrowRight');
    act(() => store.getState().setMode('story'));
    expect(screen.queryByRole('button', { name: 'Previous section' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Next section' })).toBeNull();
    act(() => store.getState().setMode('debugger'));
    expect(screen.getByRole('button', { name: 'Next section' })).toBeTruthy();
  });

  it('navigates by section and disables section buttons at the ends', async () => {
    const user = userEvent.setup();
    const { store } = renderLab(<Controls />, { bundle: createFixtureBundle() });
    expect(button('Previous section').disabled).toBe(true);
    await user.click(button('Next section'));
    expect(store.getState().step).toBe(0);
    await user.click(button('Next section'));
    expect(store.getState().step).toBe(1);
    await user.click(button('Next section'));
    expect(store.getState().step).toBe(2);
    expect(button('Next section').disabled).toBe(true);
    await user.click(button('Previous section'));
    expect(store.getState().step).toBe(1);
    await user.click(button('Previous section'));
    expect(store.getState().step).toBe(0);
    await user.click(button('Previous section'));
    expect(store.getState().step).toBe(-1);
  });

  it("labels the section buttons with the producer's outermost scope level when it declares them", () => {
    const bundle = createFixtureBundle();
    const state = bundle.facets['state@default'] as AnyStateFacet;
    const facets = { ...bundle.facets, 'state@default': { ...state, scopeLevels: [{ labelKey: 'p.round', nextKey: 'p.nextRound', prevKey: 'p.prevRound' }] } };
    renderLab(<Controls />, { bundle: { ...bundle, facets }, messages: { 'p.nextRound': 'Next round', 'p.prevRound': 'Previous round' } });
    expect(button('Next round').getAttribute('aria-keyshortcuts')).toBe('Shift+ArrowRight');
    expect(button('Previous round').getAttribute('aria-keyshortcuts')).toBe('Shift+ArrowLeft');
  });
});
