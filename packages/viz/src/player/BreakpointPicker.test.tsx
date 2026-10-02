import { act, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { createFixtureBundle } from '../testing/fixtureBundle.ts';
import { renderLab } from '../testing/renderLab.tsx';
import { BreakpointPicker } from './BreakpointPicker.tsx';

const group = () => screen.queryByRole('group', { name: 'Breakpoints' });
const chips = () => within(group()!).getAllByRole('button');

describe('BreakpointPicker', () => {
  it('shows one chip per distinct op, labelled with the raw op without producer messages', () => {
    renderLab(<BreakpointPicker />, { bundle: createFixtureBundle() });
    expect(group()?.getAttribute('aria-keyshortcuts')).toBe('B');
    expect(chips().map((chip) => chip.textContent)).toEqual(['load', 'sub', 'mix']);
    expect(chips().every((chip) => chip.getAttribute('aria-pressed') === 'false')).toBe(true);
  });

  it('collapses repeated ops into one chip', () => {
    const bundle = createFixtureBundle();
    const facet = bundle.facets['state@default'] as { steps: { op: string }[] };
    const steps = facet.steps.map((step) => ({ ...step, op: 'round' }));
    renderLab(<BreakpointPicker />, { bundle: { ...bundle, facets: { ...bundle.facets, 'state@default': { ...facet, steps } } } });
    expect(chips().map((chip) => chip.textContent)).toEqual(['round']);
  });

  it('uses the producer op labels when given', () => {
    renderLab(<BreakpointPicker />, { bundle: createFixtureBundle(), messages: { 'p.sub': 'SubBytes' }, opLabels: { sub: { labelKey: 'p.sub' } } });
    expect(chips().map((chip) => chip.textContent)).toEqual(['load', 'SubBytes', 'mix']);
  });

  it('is described by its hint', () => {
    renderLab(<BreakpointPicker />, { bundle: createFixtureBundle() });
    const hint = document.getElementById(group()!.getAttribute('aria-describedby')!);
    expect(hint?.textContent).toContain('Press B');
  });

  it('toggles breakpoints in the store and reflects them as pressed', async () => {
    const user = userEvent.setup();
    const { store } = renderLab(<BreakpointPicker />, { bundle: createFixtureBundle() });
    await user.click(screen.getByRole('button', { name: 'sub' }));
    expect(store.getState().breakpoints).toEqual(['sub']);
    expect(screen.getByRole('button', { name: 'sub' }).getAttribute('aria-pressed')).toBe('true');
    await user.click(screen.getByRole('button', { name: 'mix' }));
    expect(store.getState().breakpoints).toEqual(['sub', 'mix']);
    await user.click(screen.getByRole('button', { name: 'sub' }));
    expect(store.getState().breakpoints).toEqual(['mix']);
    expect(screen.getByRole('button', { name: 'sub' }).getAttribute('aria-pressed')).toBe('false');
    act(() => store.getState().toggleBreakpoint('load'));
    expect(screen.getByRole('button', { name: 'load' }).getAttribute('aria-pressed')).toBe('true');
  });

  it('is hidden in story mode and without a bundle', () => {
    const { store } = renderLab(<BreakpointPicker />, { bundle: createFixtureBundle() });
    act(() => store.getState().setMode('story'));
    expect(group()).toBeNull();
    act(() => store.getState().setMode('debugger'));
    expect(group()).not.toBeNull();
    act(() => store.getState().setBundle(null));
    expect(group()).toBeNull();
  });
});
