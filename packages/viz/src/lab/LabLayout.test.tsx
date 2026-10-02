import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { LabLayoutProvider, useLabLayout } from './LabLayout.tsx';

function Probe() {
  const { narrow } = useLabLayout();
  return <output>{String(narrow)}</output>;
}

describe('useLabLayout', () => {
  it('is wide outside a lab and follows the provider inside one', () => {
    const { rerender } = render(<Probe />);
    expect(screen.getByRole('status').textContent).toBe('false');
    rerender(
      <LabLayoutProvider narrow>
        <Probe />
      </LabLayoutProvider>,
    );
    expect(screen.getByRole('status').textContent).toBe('true');
  });
});
