import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useLab } from '../lab/LabContext.tsx';
import type { ViewProps } from '../workspace/viewTypes.ts';
import { createFixtureBundle } from './fixtureBundle.ts';
import { renderViewLab } from './renderLab.tsx';

function StepProbe({ labId, lens }: ViewProps) {
  const step = useLab((state) => state.step);
  return <p>{`${labId}/${lens}/${step}`}</p>;
}

describe('renderViewLab', () => {
  it('renders a view component with its props inside a lab bound to the given store', () => {
    const { store } = renderViewLab(StepProbe, { labId: 'fixture', lens: 'engineer' }, { bundle: createFixtureBundle() });
    expect(screen.getByText(`fixture/engineer/${store.getState().step}`)).toBeTruthy();
  });
});
