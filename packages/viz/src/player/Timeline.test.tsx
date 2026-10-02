import { act, fireEvent, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { StateFacet } from '@cryventure/core';
import { createFixtureBundle } from '../testing/fixtureBundle.ts';
import { renderLab } from '../testing/renderLab.tsx';
import { useScopeLabel } from './useScopeLabel.ts';
import { Timeline } from './Timeline.tsx';

describe('Timeline', () => {
  it('shows a labelled slider with step count and initial-state detail', () => {
    renderLab(<Timeline />, { bundle: createFixtureBundle() });
    const slider = screen.getByRole('slider', { name: 'Timeline' });
    expect(slider.getAttribute('min')).toBe('-1');
    expect(slider.getAttribute('max')).toBe('2');
    expect(slider.getAttribute('aria-valuetext')).toBe('Step 0 / 3 · Initial state');
    expect(screen.getByText('Step 0 / 3')).toBeTruthy();
  });

  it('seeks on change and shows the scope path', () => {
    const { store } = renderLab(<Timeline />, { bundle: createFixtureBundle() });
    fireEvent.change(screen.getByRole('slider'), { target: { value: '2' } });
    expect(store.getState().step).toBe(2);
    expect(screen.getByText('Step 3 / 3')).toBeTruthy();
    expect(screen.getByText('Round 1 · op 2')).toBeTruthy();
  });

  it("shows the op's compact label at the deepest declared scope level", () => {
    const bundle = createFixtureBundle();
    const state = bundle.facets['state@default'] as StateFacet<string, { op: string }>;
    bundle.facets['state@default'] = { ...state, scopeLevels: [{ labelKey: 'p.round' }, { labelKey: 'p.op' }] };
    const messages = { 'p.round': 'Round {{value}}', 'p.op': 'Operation {{ordinal}}', 'p.mix': 'Mix – long', 'p.mixShort': 'Mix' };
    const { store } = renderLab(<Timeline />, { bundle, messages, opLabels: { mix: { labelKey: 'p.mix', shortLabelKey: 'p.mixShort' } } });
    act(() => store.getState().seek(2));
    expect(screen.getByText('Round 1 · Mix')).toBeTruthy();
    act(() => store.getState().seek(1));
    expect(screen.getByText('Round 1 · Operation 1')).toBeTruthy();
  });

  it('is disabled without steps and follows the store', () => {
    const { store } = renderLab(<Timeline />);
    expect((screen.getByRole('slider') as HTMLInputElement).disabled).toBe(true);
    act(() => store.getState().setBundle(createFixtureBundle()));
    expect((screen.getByRole('slider') as HTMLInputElement).disabled).toBe(false);
  });

  it('renders German text with German messages', () => {
    renderLab(<Timeline />, { bundle: createFixtureBundle(), messages: { 'ui.player.stepOf': 'Schritt {{current}} / {{total}}' } });
    expect(screen.getByText('Schritt 0 / 3')).toBeTruthy();
  });
});

describe('Timeline markers', () => {
  const marks = (kind: 'round' | 'breakpoint') => [...document.querySelectorAll(`.cv-timeline__mark--${kind}`)].map((mark) => mark.getAttribute('data-step'));

  it('marks round starts after the first step, positioned along the slider', () => {
    renderLab(<Timeline />, { bundle: createFixtureBundle() });
    expect(marks('round')).toEqual(['1']);
    const mark = document.querySelector('.cv-timeline__mark--round[data-step="1"]') as HTMLElement;
    expect(mark.style.getPropertyValue('--cv-mark-at')).toBe(String(2 / 3));
    expect(mark.parentElement?.getAttribute('aria-hidden')).toBe('true');
    expect(marks('breakpoint')).toEqual([]);
  });

  it('marks the steps of toggled breakpoint ops', () => {
    const { store } = renderLab(<Timeline />, { bundle: createFixtureBundle() });
    act(() => store.getState().toggleBreakpoint('mix'));
    expect(marks('breakpoint')).toEqual(['2']);
    act(() => store.getState().toggleBreakpoint('load'));
    expect(marks('breakpoint')).toEqual(['0', '2']);
    act(() => store.getState().toggleBreakpoint('mix'));
    expect(marks('breakpoint')).toEqual(['0']);
  });

  it('has no markers without a bundle', () => {
    renderLab(<Timeline />);
    expect(document.querySelectorAll('.cv-timeline__mark')).toHaveLength(0);
  });
});

describe('useScopeLabel', () => {
  function Probe() {
    return <span data-testid="scope">{useScopeLabel()}</span>;
  }

  it('is empty at the initial state and follows the playhead', () => {
    const { store } = renderLab(<Probe />, { bundle: createFixtureBundle() });
    expect(screen.getByTestId('scope').textContent).toBe('');
    act(() => store.getState().seek(1));
    expect(screen.getByTestId('scope').textContent).toBe('Round 1 · op 1');
  });

  it('shows no scope label (no invented "Round 0") when the producer declares no scope levels', () => {
    const bundle = createFixtureBundle();
    const { scopeLevels: _omitted, ...state } = bundle.facets['state@default'] as StateFacet<string, { op: string }>;
    bundle.facets['state@default'] = state;
    const { store } = renderLab(
      <>
        <Probe />
        <Timeline />
      </>,
      { bundle },
    );
    act(() => store.getState().seek(0));
    expect(screen.getByTestId('scope').textContent).toBe('');
    expect(document.querySelector('.cv-timeline__scope')).toBeNull();
    expect(screen.getByRole('slider').getAttribute('aria-valuetext')).toBe('Step 1 / 3');
  });
});
