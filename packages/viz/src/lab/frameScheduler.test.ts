import { describe, expect, it, vi } from 'vitest';
import { createManualScheduler } from '../testing/manualScheduler.ts';
import { runTimed } from './frameScheduler.ts';

describe('runTimed', () => {
  it('reports monotonic fractions up to 1, then finishes once', () => {
    const scheduler = createManualScheduler();
    const fractions: number[] = [];
    const onDone = vi.fn();
    runTimed(scheduler, 100, (fraction) => fractions.push(fraction), onDone);
    expect(fractions).toEqual([]);
    scheduler.advance(500);
    expect(fractions.at(-1)).toBe(1);
    expect(fractions.filter((fraction) => fraction === 1)).toHaveLength(1);
    fractions.forEach((fraction, index) => expect(fraction).toBeGreaterThanOrEqual(fractions[index - 1] ?? 0));
    expect(Math.min(...fractions)).toBeGreaterThan(0);
    expect(onDone).toHaveBeenCalledOnce();
    expect(scheduler.pending()).toBe(0);
  });

  it('finishes when the duration has elapsed, not before', () => {
    const scheduler = createManualScheduler();
    const onDone = vi.fn();
    runTimed(scheduler, 100, () => {}, onDone);
    scheduler.advance(99);
    expect(onDone).not.toHaveBeenCalled();
    scheduler.advance(1);
    expect(onDone).toHaveBeenCalledOnce();
  });

  it('stops when cancelled', () => {
    const scheduler = createManualScheduler();
    const onFrame = vi.fn();
    const onDone = vi.fn();
    const cancel = runTimed(scheduler, 100, onFrame, onDone);
    scheduler.advance(32);
    const frames = onFrame.mock.calls.length;
    cancel();
    scheduler.advance(200);
    expect(onFrame).toHaveBeenCalledTimes(frames);
    expect(onDone).not.toHaveBeenCalled();
    expect(scheduler.pending()).toBe(0);
  });

  it('finishes a zero (or negative) duration on the next frame, never synchronously', () => {
    for (const duration of [0, -5]) {
      const scheduler = createManualScheduler();
      const onFrame = vi.fn();
      const onDone = vi.fn();
      runTimed(scheduler, duration, onFrame, onDone);
      expect(onFrame).not.toHaveBeenCalled();
      expect(onDone).not.toHaveBeenCalled();
      scheduler.advance(16);
      expect(onFrame).toHaveBeenCalledExactlyOnceWith(1);
      expect(onDone).toHaveBeenCalledOnce();
    }
  });
});
