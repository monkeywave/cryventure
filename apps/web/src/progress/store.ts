import { emptyProgress, type Lens, type ProgressV1, type QuizAnswer } from './schema.ts';
import { loadProgress, parseStoredProgress, PROGRESS_STORAGE_KEY, saveProgress } from './storage.ts';

export type ProgressListener = () => void;
export type ProgressUpdater = (progress: ProgressV1) => ProgressV1;

/** Persistence the store depends on; injectable so tests can simulate failing storage. */
export interface ProgressPersistence {
  load: () => ProgressV1;
  save: (progress: ProgressV1) => boolean;
}

export interface ProgressStore {
  getProgress: () => ProgressV1;
  subscribe: (listener: ProgressListener) => () => void;
  updateProgress: (update: ProgressUpdater) => void;
}

const defaultPersistence: ProgressPersistence = { load: loadProgress, save: saveProgress };

function eventTarget(): Pick<Window, 'addEventListener' | 'removeEventListener'> | undefined {
  return typeof window === 'undefined' ? undefined : window;
}

/**
 * A subscribable progress store. State loads lazily on first read and is written back only when it
 * changes, so an unreadable or newer-version entry survives until the learner records something.
 * Other tabs' writes arrive via the `storage` event (`key === null` means storage was cleared).
 */
export function createProgressStore(persistence: ProgressPersistence = defaultPersistence): ProgressStore {
  let current: ProgressV1 | undefined;
  const listeners = new Set<ProgressListener>();
  const notify = (): void => listeners.forEach((listener) => listener());

  const onStorage = (event: StorageEvent): void => {
    if (event.key !== null && event.key !== PROGRESS_STORAGE_KEY) return;
    current = parseStoredProgress(event.newValue);
    notify();
  };

  const getProgress = (): ProgressV1 => (current ??= persistence.load());

  const subscribe = (listener: ProgressListener): (() => void) => {
    if (listeners.size === 0) eventTarget()?.addEventListener('storage', onStorage);
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
      if (listeners.size === 0) eventTarget()?.removeEventListener('storage', onStorage);
    };
  };

  const updateProgress = (update: ProgressUpdater): void => {
    const next = update(getProgress());
    if (next === current) return;
    current = next;
    persistence.save(next);
    notify();
  };

  return { getProgress, subscribe, updateProgress };
}

/**
 * The learner's answer state after one more attempt: `lastAnswer` reflects the latest answer, while
 * `solved` stays true once any attempt was correct.
 */
export function nextQuizAnswer(previous: QuizAnswer | undefined, answerIndex: number, correct: boolean): QuizAnswer {
  return { solved: correct || previous?.solved === true, lastAnswer: answerIndex };
}

export function withQuizAnswer(progress: ProgressV1, lessonKey: string, questionNumber: number, answerIndex: number, correct: boolean): ProgressV1 {
  const lesson = progress.lessons[lessonKey] ?? { quiz: {} };
  const key = String(questionNumber);
  const quiz = { ...lesson.quiz, [key]: nextQuizAnswer(lesson.quiz[key], answerIndex, correct) };
  return { ...progress, lessons: { ...progress.lessons, [lessonKey]: { ...lesson, quiz } } };
}

/** `next` with the lens of `current`: the lens is a device preference rather than progress. */
export function withLensOf(next: ProgressV1, current: ProgressV1): ProgressV1 {
  const { lens: _lens, ...rest } = next;
  return current.lens === undefined ? rest : { ...rest, lens: current.lens };
}

/** Clears quiz results and the prologue but keeps the lens, which is a preference rather than progress. */
export function resetKeepingLens(progress: ProgressV1): ProgressV1 {
  return withLensOf(emptyProgress(), progress);
}

const store = createProgressStore();

export const getProgress = store.getProgress;
export const subscribe = store.subscribe;
export const updateProgress = store.updateProgress;

export function recordQuizAnswer(lessonKey: string, questionNumber: number, answerIndex: number, correct: boolean): void {
  updateProgress((progress) => withQuizAnswer(progress, lessonKey, questionNumber, answerIndex, correct));
}

export function setLens(lens: Lens): void {
  updateProgress((progress) => (progress.lens === lens ? progress : { ...progress, lens }));
}

export function completePrologue(now: Date): void {
  updateProgress((progress) => ({ ...progress, prologue: { completedAt: now.toISOString() } }));
}

export function resetProgress(): void {
  updateProgress(resetKeepingLens);
}

/** Replaces all progress, e.g. after a successful import. */
export function replaceProgress(progress: ProgressV1): void {
  updateProgress(() => progress);
}

/** Adopts imported progress but keeps this device's lens (like `resetProgress`). */
export function importProgressKeepingLens(imported: ProgressV1): void {
  updateProgress((current) => withLensOf(imported, current));
}
