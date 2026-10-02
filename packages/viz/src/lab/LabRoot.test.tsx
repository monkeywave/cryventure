import { act, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { installResizeObserverMock } from '../workspace/resizeObserverMock.ts';
import { renderLab } from '../testing/renderLab.tsx';
import { useLab, useLabActions, useLabStore } from './LabContext.tsx';
import { useLabLayout } from './LabLayout.tsx';

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

function LayoutProbe() {
  const { narrow } = useLabLayout();
  return <output data-testid="layout">{String(narrow)}</output>;
}

describe('LabRoot layout', () => {
  afterEach(() => vi.restoreAllMocks());

  it('measures the lab container and shares narrow/wide with every descendant', () => {
    const mock = installResizeObserverMock();
    renderLab(<LayoutProbe />);
    const lab = screen.getByRole('region', { name: 'Interactive lab' });
    expect(screen.getByTestId('layout').textContent).toBe('false');
    act(() => mock.resize(lab, 390));
    expect(screen.getByTestId('layout').textContent).toBe('true');
    expect(lab.dataset['narrow']).toBe('true');
    act(() => mock.resize(lab, 1280));
    expect(screen.getByTestId('layout').textContent).toBe('false');
    mock.restore();
  });

  it('is wide outside a lab', () => {
    render(<LayoutProbe />);
    expect(screen.getByTestId('layout').textContent).toBe('false');
  });
});
