// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { noteToBytes } from './noteBytes.ts';
import { usePrologue } from './usePrologue.ts';

describe('usePrologue note bytes', () => {
  it('keeps the same noteBytes array across renders while the note is unchanged', () => {
    const { result, rerender } = renderHook(() => usePrologue('Hi'));
    const first = result.current.noteBytes;
    expect(first).toEqual(noteToBytes('Hi'));
    rerender();
    expect(result.current.noteBytes).toBe(first);
  });

  it('recomputes noteBytes when the note changes', () => {
    const { result } = renderHook(() => usePrologue('Hi'));
    const first = result.current.noteBytes;
    act(() => result.current.setNote('Hey'));
    expect(result.current.noteBytes).not.toBe(first);
    expect(result.current.noteBytes).toEqual(noteToBytes('Hey'));
  });
});
