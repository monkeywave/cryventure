import { describe, expect, it, vi } from 'vitest';
import { createSourceMarks } from './sourceMarks.ts';
import { aesDerivation } from './testFixture.ts';

describe('createSourceMarks', () => {
  it('marks the sources of the previewed word, else of the selected one', () => {
    const marks = createSourceMarks(aesDerivation);
    expect(marks.isSource('w/0')).toBe(false);
    marks.select('w/5');
    expect(['w/1', 'w/4'].every(marks.isSource)).toBe(true);
    marks.preview('w/4');
    expect(['w/0', 'w/3'].every(marks.isSource)).toBe(true);
    expect(marks.isSource('w/1')).toBe(false);
    marks.preview(null);
    expect(marks.isSource('w/1')).toBe(true);
  });

  it('notifies only when the marked word changes', () => {
    const marks = createSourceMarks(aesDerivation);
    const listener = vi.fn();
    const unsubscribe = marks.subscribe(listener);
    marks.preview('w/4');
    marks.select('w/4');
    marks.preview(null);
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
    marks.select(null);
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
