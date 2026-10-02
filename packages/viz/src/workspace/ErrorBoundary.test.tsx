import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ErrorBoundary } from './ErrorBoundary.tsx';

afterEach(() => vi.restoreAllMocks());

describe('ErrorBoundary', () => {
  it('renders the fallback on error and children again after reset', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    let shouldThrow = true;
    const Flaky = () => {
      if (shouldThrow) throw new Error('boom');
      return <p>recovered</p>;
    };
    const onError = vi.fn();
    const onReset = vi.fn();
    render(
      <ErrorBoundary onError={onError} onReset={onReset} fallback={(reset, error) => <button onClick={reset}>{String((error as Error).message)}</button>}>
        <Flaky />
      </ErrorBoundary>,
    );
    expect(onError).toHaveBeenCalledOnce();
    shouldThrow = false;
    await userEvent.click(screen.getByRole('button', { name: 'boom' }));
    expect(onReset).toHaveBeenCalledOnce();
    expect(screen.getByText('recovered')).toBeTruthy();
  });
});
