// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { emptyProgress, type Progress } from './schema.ts';
import { LEGACY_PROGRESS_STORAGE_KEY, loadProgress, parseStoredProgress, PROGRESS_STORAGE_KEY, saveProgress } from './storage.ts';

const progress: Progress = { version: 2, lens: 'story', lessons: { a: { quiz: { 'aes-rounds': { solved: true, lastAnswer: 0 } } } } };

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

  it('reads a record stored by the first v1 release (correct/attempts, no solved), mapping numbers to ids', () => {
    const stored = JSON.stringify({ version: 1, lens: 'story', lessons: { 'foundations/xor': { quiz: { '1': { correct: true, attempts: 2, lastAnswer: 0 } } } } });
    expect(parseStoredProgress(stored)).toEqual({ version: 2, lens: 'story', lessons: { 'foundations/xor': { quiz: { 'xor-with-ff': { solved: true, lastAnswer: 0 } } } } });
  });
});

describe('saveProgress / loadProgress', () => {
  it('round-trips through localStorage under cv.progress.v2 and never writes cv.progress.v1', () => {
    expect(PROGRESS_STORAGE_KEY).toBe('cv.progress.v2');
    expect(LEGACY_PROGRESS_STORAGE_KEY).toBe('cv.progress.v1');
    expect(saveProgress(progress)).toBe(true);
    expect(localStorage.getItem(PROGRESS_STORAGE_KEY)).not.toBeNull();
    expect(localStorage.getItem(LEGACY_PROGRESS_STORAGE_KEY)).toBeNull();
    expect(loadProgress()).toEqual(progress);
  });

  describe('migrating the v1 slot', () => {
    const v1 = JSON.stringify({ version: 1, lens: 'story', lessons: { 'foundations/xor': { quiz: { '2': { solved: true, lastAnswer: 1 } } } } });
    const migrated: Progress = { version: 2, lens: 'story', lessons: { 'foundations/xor': { quiz: { 'two-time-pad': { solved: true, lastAnswer: 1 } } } } };

    it('migrates cv.progress.v1 into cv.progress.v2 when v2 is absent, leaving v1 untouched', () => {
      localStorage.setItem(LEGACY_PROGRESS_STORAGE_KEY, v1);
      expect(loadProgress()).toEqual(migrated);
      expect(JSON.parse(localStorage.getItem(PROGRESS_STORAGE_KEY) ?? 'null')).toEqual(migrated);
      expect(localStorage.getItem(LEGACY_PROGRESS_STORAGE_KEY)).toBe(v1);
    });

    it('ignores cv.progress.v1 once cv.progress.v2 exists (an old tab writing v1 cannot wipe v2)', () => {
      saveProgress(progress);
      localStorage.setItem(LEGACY_PROGRESS_STORAGE_KEY, JSON.stringify({ version: 1, lessons: {} }));
      expect(loadProgress()).toEqual(progress);
    });

    it('writes nothing when neither slot exists', () => {
      expect(loadProgress()).toEqual(emptyProgress());
      expect(localStorage.length).toBe(0);
    });
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
