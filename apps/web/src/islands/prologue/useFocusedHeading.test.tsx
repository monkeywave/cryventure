// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { useFocusedHeading } from './useFocusedHeading.ts';

function Heading({ trigger, enabled }: { trigger: string; enabled: boolean }) {
  const ref = useFocusedHeading(trigger, enabled);
  return (
    <>
      <button type="button">elsewhere</button>
      <h2 ref={ref} tabIndex={-1}>
        {trigger}
      </h2>
    </>
  );
}

afterEach(cleanup);

describe('useFocusedHeading', () => {
  it('does not move focus before the learner has interacted', () => {
    render(<Heading trigger="a" enabled={false} />);
    expect(document.activeElement).toBe(document.body);
  });

  it('focuses the heading when enabled and again whenever the trigger changes', () => {
    const { rerender } = render(<Heading trigger="a" enabled />);
    expect(document.activeElement).toBe(screen.getByRole('heading'));
    screen.getByRole('button').focus();
    rerender(<Heading trigger="b" enabled />);
    expect(document.activeElement).toBe(screen.getByRole('heading'));
  });

  it('leaves focus alone while the trigger stays the same', () => {
    const { rerender } = render(<Heading trigger="a" enabled />);
    screen.getByRole('button').focus();
    rerender(<Heading trigger="a" enabled />);
    expect(document.activeElement).toBe(screen.getByRole('button'));
  });
});
