import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderLab } from '../testing/renderLab.tsx';
import { useLab, useLabActions, useLabStore } from './LabContext.tsx';

function Probe() {
  const step = useLab((state) => state.step);
  const actions = useLabActions();
  const store = useLabStore();
  return <output data-testid="probe">{`${step}:${typeof actions.next}:${store.getState().stepCount}`}</output>;
}

describe('LabRoot / LabContext', () => {
  it('renders a labelled lab region and provides the store to hooks', () => {
    renderLab(<Probe />);
    expect(screen.getByRole('region', { name: 'Interactive lab' })).toBeTruthy();
    expect(screen.getByTestId('probe').textContent).toBe('-1:function:0');
  });
});
