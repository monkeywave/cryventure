import { afterEach, describe, expect, it, vi } from 'vitest';
import { safeStorage } from './safeStorage.ts';

afterEach(() => vi.restoreAllMocks());

describe('safeStorage', () => {
  it('returns localStorage when available', () => {
    expect(safeStorage()).toBe(localStorage);
  });

  it('returns undefined instead of throwing when access is blocked', () => {
    vi.spyOn(globalThis, 'localStorage', 'get').mockImplementation(() => {
      throw new DOMException('blocked', 'SecurityError');
    });
    expect(safeStorage()).toBeUndefined();
  });
});
