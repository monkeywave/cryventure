// @vitest-environment jsdom
import '@cryventure/viz/testing/setup';
import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '@cryventure/viz';
import { labMessages } from '../../labs/labMessages.ts';
import { producerRegistry } from '../../labs/registry.ts';
import { COMPUTING_DELAY_MS, ComputingStatus } from './ComputingStatus.tsx';
import '../../styles/lab.css';

const aes = producerRegistry.require('aes');

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

function renderStatus(computing: boolean, lang = 'en') {
  const ui = (value: boolean) => (
    <I18nProvider messages={labMessages(lang, aes)}>
      <ComputingStatus computing={value} />
    </I18nProvider>
  );
  const { rerender } = render(ui(computing));
  return { status: screen.getByRole('status'), rerender: (value: boolean) => rerender(ui(value)) };
}

describe('ComputingStatus', () => {
  it('waits 300 ms before showing "Computing…"', () => {
    const { status } = renderStatus(true);
    expect(COMPUTING_DELAY_MS).toBe(300);
    expect(status.textContent).toBe('');
    act(() => vi.advanceTimersByTime(COMPUTING_DELAY_MS - 1));
    expect(status.textContent).toBe('');
    act(() => vi.advanceTimersByTime(1));
    expect(status.textContent).toBe('Computing…');
    expect(status.getAttribute('data-computing')).toBe('true');
  });

  it('never shows for a run that settles sooner, and hides at once when a slow run settles', () => {
    const { status, rerender } = renderStatus(true);
    act(() => vi.advanceTimersByTime(200));
    rerender(false);
    act(() => vi.advanceTimersByTime(1000));
    expect(status.textContent).toBe('');
    rerender(true);
    act(() => vi.advanceTimersByTime(COMPUTING_DELAY_MS));
    expect(status.textContent).toBe('Computing…');
    rerender(false);
    expect(status.textContent).toBe('');
  });

  it('restarts the delay for the next run', () => {
    const { status, rerender } = renderStatus(true);
    act(() => vi.advanceTimersByTime(COMPUTING_DELAY_MS));
    rerender(false);
    rerender(true);
    expect(status.textContent).toBe('');
    act(() => vi.advanceTimersByTime(COMPUTING_DELAY_MS));
    expect(status.textContent).toBe('Computing…');
  });

  it('keeps the live region boxed in the accessibility tree while empty (visually hidden, no display: contents)', () => {
    const { status, rerender } = renderStatus(false);
    const empty = getComputedStyle(status);
    expect(empty.display).not.toBe('contents');
    expect(empty.display).not.toBe('none');
    expect(empty.position).toBe('absolute');
    expect(empty.clipPath).toBe('inset(50%)');
    rerender(true);
    act(() => vi.advanceTimersByTime(COMPUTING_DELAY_MS));
    expect(status.textContent).not.toBe('');
    expect(getComputedStyle(status).position).not.toBe('absolute');
  });

  it('is localized', () => {
    const { status } = renderStatus(true, 'de');
    act(() => vi.advanceTimersByTime(COMPUTING_DELAY_MS));
    expect(status.textContent).toBe('Wird berechnet …');
  });
});
