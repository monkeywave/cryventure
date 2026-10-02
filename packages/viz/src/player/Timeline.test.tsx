import { act, fireEvent, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
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
});
