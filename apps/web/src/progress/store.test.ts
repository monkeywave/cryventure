// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { emptyProgress, type ProgressV1 } from './schema.ts';
import { PROGRESS_STORAGE_KEY } from './storage.ts';
import { createProgressStore, nextQuizAnswer, resetKeepingLens, withQuizAnswer, type ProgressPersistence } from './store.ts';

function fakePersistence(initial: ProgressV1 = emptyProgress()): ProgressPersistence & { saved: ProgressV1[] } {
  const saved: ProgressV1[] = [];
  return { saved, load: vi.fn(() => initial), save: vi.fn((p: ProgressV1) => (saved.push(p), true)) };
}

function storageEvent(key: string | null, newValue: string | null): StorageEvent {
  return new StorageEvent('storage', { key, newValue });
}

describe('nextQuizAnswer / withQuizAnswer', () => {
  it('counts attempts and keeps the latest answer', () => {
    const first = nextQuizAnswer(undefined, 2, false);
    expect(first).toEqual({ correct: false, solved: false, attempts: 1, lastAnswer: 2 });
    expect(nextQuizAnswer(first, 0, true)).toEqual({ correct: true, solved: true, attempts: 2, lastAnswer: 0 });
  });

  it('stays solved after a later wrong attempt', () => {
    const solved = nextQuizAnswer(undefined, 0, true);
    expect(nextQuizAnswer(solved, 2, false)).toEqual({ correct: false, solved: true, attempts: 2, lastAnswer: 2 });
  });

  it('adds the answer without mutating the input', () => {
    const before = emptyProgress();
    const after = withQuizAnswer(before, 'a/b', 3, 1, true);
    expect(after.lessons['a/b']?.quiz['3']).toEqual({ correct: true, solved: true, attempts: 1, lastAnswer: 1 });
    expect(before).toEqual(emptyProgress());
  });
});

describe('resetKeepingLens', () => {
  it('clears everything but the lens', () => {
    const progress: ProgressV1 = { version: 1, lens: 'story', prologue: { completedAt: 'x' }, lessons: { a: { quiz: {} } } };
    expect(resetKeepingLens(progress)).toEqual({ version: 1, lens: 'story', lessons: {} });
    expect(resetKeepingLens(emptyProgress())).toEqual(emptyProgress());
  });
});

describe('createProgressStore', () => {
  it('loads lazily, once', () => {
    const persistence = fakePersistence();
    const store = createProgressStore(persistence);
    expect(persistence.load).not.toHaveBeenCalled();
    store.getProgress();
    store.getProgress();
    expect(persistence.load).toHaveBeenCalledTimes(1);
  });

  it('saves and notifies on change, and does neither for an identity update', () => {
    const persistence = fakePersistence();
    const store = createProgressStore(persistence);
    const listener = vi.fn();
    store.subscribe(listener);
    store.updateProgress((p) => p);
    expect(listener).not.toHaveBeenCalled();
    expect(persistence.save).not.toHaveBeenCalled();
    store.updateProgress((p) => ({ ...p, lens: 'story' }));
    expect(listener).toHaveBeenCalledTimes(1);
    expect(persistence.saved).toEqual([{ version: 1, lens: 'story', lessons: {} }]);
    expect(store.getProgress().lens).toBe('story');
  });

  it('keeps working in memory when saving fails', () => {
    const persistence = { ...fakePersistence(), save: () => false };
    const store = createProgressStore(persistence);
    store.updateProgress((p) => ({ ...p, lens: 'cryptographer' }));
    expect(store.getProgress().lens).toBe('cryptographer');
  });

  it('stops notifying after unsubscribe', () => {
    const store = createProgressStore(fakePersistence());
    const listener = vi.fn();
    store.subscribe(listener)();
    store.updateProgress((p) => ({ ...p, lens: 'story' }));
    expect(listener).not.toHaveBeenCalled();
  });

  describe('cross-tab sync', () => {
    it('adopts another tab’s write and notifies', () => {
      const store = createProgressStore(fakePersistence());
      const listener = vi.fn();
      store.subscribe(listener);
      window.dispatchEvent(storageEvent(PROGRESS_STORAGE_KEY, JSON.stringify({ version: 1, lens: 'story', lessons: {} })));
      expect(listener).toHaveBeenCalledTimes(1);
      expect(store.getProgress()).toEqual({ version: 1, lens: 'story', lessons: {} });
    });

    it('treats a cleared storage (key null) as empty progress', () => {
      const store = createProgressStore(fakePersistence({ version: 1, lens: 'story', lessons: {} }));
      store.subscribe(() => {});
      window.dispatchEvent(storageEvent(null, null));
      expect(store.getProgress()).toEqual(emptyProgress());
    });

    it('ignores other keys and stops listening once nobody subscribes', () => {
      const store = createProgressStore(fakePersistence());
      const listener = vi.fn();
      const unsubscribe = store.subscribe(listener);
      window.dispatchEvent(storageEvent('cv.layout.v1.aes', '{}'));
      expect(listener).not.toHaveBeenCalled();
      unsubscribe();
      window.dispatchEvent(storageEvent(PROGRESS_STORAGE_KEY, JSON.stringify({ version: 1, lens: 'story', lessons: {} })));
      expect(store.getProgress()).toEqual(emptyProgress());
    });
  });
});

describe('default store actions', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.resetModules();
  });
  afterEach(() => localStorage.clear());

  const load = () => import('./store.ts');
  const stored = (): unknown => JSON.parse(localStorage.getItem(PROGRESS_STORAGE_KEY) ?? 'null');

  it('recordQuizAnswer persists under the lesson key', async () => {
    const { recordQuizAnswer, getProgress } = await load();
    recordQuizAnswer('symmetric/aes/subbytes-sbox', 1, 2, false);
    recordQuizAnswer('symmetric/aes/subbytes-sbox', 1, 0, true);
    const expected = { correct: true, solved: true, attempts: 2, lastAnswer: 0 };
    expect(getProgress().lessons['symmetric/aes/subbytes-sbox']?.quiz['1']).toEqual(expected);
    expect(stored()).toMatchObject({ lessons: { 'symmetric/aes/subbytes-sbox': { quiz: { '1': expected } } } });
  });

  it('setLens stores the lens and is a no-op when unchanged', async () => {
    const { setLens, subscribe } = await load();
    const listener = vi.fn();
    subscribe(listener);
    setLens('story');
    setLens('story');
    expect(listener).toHaveBeenCalledTimes(1);
    expect(stored()).toMatchObject({ lens: 'story' });
  });

  it('completePrologue records the ISO timestamp', async () => {
    const { completePrologue, getProgress } = await load();
    completePrologue(new Date('2026-10-02T12:00:00Z'));
    expect(getProgress().prologue).toEqual({ completedAt: '2026-10-02T12:00:00.000Z' });
  });

  it('resetProgress clears results but keeps the lens', async () => {
    const { recordQuizAnswer, setLens, resetProgress, getProgress } = await load();
    setLens('cryptographer');
    recordQuizAnswer('a', 1, 0, true);
    resetProgress();
    expect(getProgress()).toEqual({ version: 1, lens: 'cryptographer', lessons: {} });
    expect(stored()).toEqual({ version: 1, lens: 'cryptographer', lessons: {} });
  });

  it('replaceProgress swaps in imported progress', async () => {
    const { replaceProgress, getProgress } = await load();
    const imported: ProgressV1 = { version: 1, lessons: { b: { quiz: {} } } };
    replaceProgress(imported);
    expect(getProgress()).toBe(imported);
  });

  it('does not overwrite a newer-version entry until something changes', async () => {
    const future = JSON.stringify({ version: 2, lessons: {}, newField: true });
    localStorage.setItem(PROGRESS_STORAGE_KEY, future);
    const { getProgress } = await load();
    expect(getProgress()).toEqual(emptyProgress());
    expect(localStorage.getItem(PROGRESS_STORAGE_KEY)).toBe(future);
  });
});
