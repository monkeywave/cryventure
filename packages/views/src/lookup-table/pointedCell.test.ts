import { describe, expect, it, vi } from 'vitest';
import { createPointedCell } from './pointedCell.ts';

describe('createPointedCell', () => {
  it('starts empty and notifies subscribers only when the cell changes', () => {
    const pointed = createPointedCell();
    const listener = vi.fn();
    const unsubscribe = pointed.subscribe(listener);
    expect(pointed.get()).toBeNull();
    pointed.set(5);
    pointed.set(5);
    expect(pointed.get()).toBe(5);
    expect(listener).toHaveBeenCalledTimes(1);
    pointed.set(null);
    expect(listener).toHaveBeenCalledTimes(2);
    unsubscribe();
    pointed.set(7);
    expect(listener).toHaveBeenCalledTimes(2);
  });
});
