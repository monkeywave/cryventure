import { afterEach, describe, expect, it, vi } from 'vitest';
import { LAYOUT_VERSION, layoutStorageKey, loadPanelSizes, safeStorage, savePanelSizes } from './layoutStorage.ts';

afterEach(() => vi.restoreAllMocks());

describe('layout storage', () => {
  it('uses a versioned key per lab', () => {
    expect(layoutStorageKey('aes-128')).toBe('cv.layout.v1.aes-128');
    expect(LAYOUT_VERSION).toBe(1);
  });

  it('round-trips sizes for the same panel set', () => {
    expect(savePanelSizes('lab', ['a', 'b'], { a: 30, b: 70 })).toBe(true);
    expect(loadPanelSizes('lab', ['a', 'b'])).toEqual({ a: 30, b: 70 });
  });

  it('resets (removes) entries for another panel set, version or corrupt JSON', () => {
    savePanelSizes('lab', ['a', 'b'], { a: 30, b: 70 });
    expect(loadPanelSizes('lab', ['a', 'c'])).toBeUndefined();
    expect(localStorage.getItem('cv.layout.v1.lab')).toBeNull();

    localStorage.setItem('cv.layout.v1.lab', JSON.stringify({ version: 0, panelIds: ['a'], sizes: {} }));
    expect(loadPanelSizes('lab', ['a'])).toBeUndefined();
    expect(localStorage.getItem('cv.layout.v1.lab')).toBeNull();

    localStorage.setItem('cv.layout.v1.lab', '{not json');
    expect(loadPanelSizes('lab', ['a'])).toBeUndefined();
  });

  it('never throws when storage is blocked', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });
    expect(loadPanelSizes('lab', ['a'])).toBeUndefined();
    expect(savePanelSizes('lab', ['a'], { a: 100 })).toBe(false);
  });
});

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
