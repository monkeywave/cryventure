// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { emptyProgress, type ProgressV1 } from './schema.ts';
import { loadProgress, parseStoredProgress, PROGRESS_STORAGE_KEY, saveProgress } from './storage.ts';

const progress: ProgressV1 = { version: 1, lens: 'story', lessons: { a: { quiz: { '1': { solved: true, lastAnswer: 0 } } } } };

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe('parseStoredProgress', () => {
  it('yields empty progress for null, bad JSON and garbage', () => {
    expect(parseStoredProgress(null)).toEqual(emptyProgress());
    expect(parseStoredProgress('{oops')).toEqual(emptyProgress());
    expect(parseStoredProgress('"text"')).toEqual(emptyProgress());
  });

  it('reads a record stored by the first v1 release (correct/attempts, no solved)', () => {
    const stored = JSON.stringify({ version: 1, lens: 'story', lessons: { a: { quiz: { '1': { correct: true, attempts: 2, lastAnswer: 0 } } } } });
    expect(parseStoredProgress(stored)).toEqual(progress);
  });
});

describe('saveProgress / loadProgress', () => {
  it('round-trips through localStorage under cv.progress.v1', () => {
    expect(saveProgress(progress)).toBe(true);
    expect(localStorage.getItem(PROGRESS_STORAGE_KEY)).not.toBeNull();
    expect(loadProgress()).toEqual(progress);
  });

  it('loads empty progress when nothing is stored', () => {
    expect(loadProgress()).toEqual(emptyProgress());
  });

  it('never throws when getItem or setItem throw', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('denied', 'SecurityError');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('full', 'QuotaExceededError');
    });
    expect(loadProgress()).toEqual(emptyProgress());
    expect(saveProgress(progress)).toBe(false);
  });

  it('never throws when accessing localStorage itself throws', () => {
    vi.stubGlobal('localStorage', undefined);
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      get() {
        throw new DOMException('denied', 'SecurityError');
      },
    });
    expect(loadProgress()).toEqual(emptyProgress());
    expect(saveProgress(progress)).toBe(false);
  });
});
