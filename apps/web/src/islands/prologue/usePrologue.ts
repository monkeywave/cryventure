import { useState } from 'react';
import type { Lens } from '@cryventure/core';
import { completePrologue, setLens, useProgress } from '../../progress/index.ts';
import { clampNoteToBytes, noteToBytes, randomKey, type FillRandom } from './noteBytes.ts';
import { CHOOSE_SCENE, FIRST_SCENE, nextScene, previousScene, prologueView, type PrologueSession, type PrologueView, type SceneId } from './prologueModel.ts';

export interface PrologueState {
  view: PrologueView;
  scene: SceneId;
  note: string;
  noteBytes: Uint8Array;
  key: Uint8Array;
  /** `true` once the learner navigated; only then may the island move focus. */
  interacted: boolean;
  completedAt: string | undefined;
  lens: Lens | undefined;
  setNote: (text: string) => void;
  next: () => void;
  back: () => void;
  skip: () => void;
  rollKey: () => void;
  choose: (lens: Lens) => void;
  replay: () => void;
}

const EMPTY_KEY = new Uint8Array(0);

/** The note and its one-time key; the key is (re)generated only when asked, never during render. */
function useNoteAndKey(defaultNote: string, fill?: FillRandom) {
  const [note, setNoteText] = useState(() => clampNoteToBytes(defaultNote));
  const [key, setKey] = useState<Uint8Array>(EMPTY_KEY);
  const noteBytes = noteToBytes(note);
  return {
    note,
    noteBytes,
    key,
    setNote: (text: string) => setNoteText(clampNoteToBytes(text)),
    ensureKey: () => {
      if (key.length !== noteBytes.length) setKey(randomKey(noteBytes.length, fill));
    },
    rollKey: () => setKey(randomKey(noteBytes.length, fill)),
  };
}

/** Self-placement: the chosen lens becomes the page-wide default and the prologue counts as done. */
function finishWithLens(lens: Lens): void {
  setLens(lens);
  completePrologue(new Date());
}

/** Tracks whether the learner has navigated yet; `act` wraps an action so it counts as interaction. */
function useInteraction() {
  const [interacted, setInteracted] = useState(false);
  const act =
    <Args extends unknown[]>(action: (...args: Args) => void) =>
    (...args: Args): void => {
      setInteracted(true);
      action(...args);
    };
  return { interacted, act };
}

/**
 * State of the prologue island. The key is generated only on user actions (never during render), so
 * server and hydration output match; `fill` lets tests supply deterministic randomness.
 */
export function usePrologue(defaultNote: string, fill?: FillRandom): PrologueState {
  const completedAt = useProgress((progress) => progress.prologue?.completedAt);
  const lens = useProgress((progress) => progress.lens);
  const [scene, setScene] = useState<SceneId>(FIRST_SCENE);
  const noteAndKey = useNoteAndKey(defaultNote, fill);
  const { noteBytes, ensureKey } = noteAndKey;
  const [session, setSession] = useState<PrologueSession>('visit');
  const { interacted, act } = useInteraction();

  const next = (): void => {
    if (noteBytes.length === 0) return;
    ensureKey();
    setScene(nextScene(scene));
  };
  const choose = (chosen: Lens): void => {
    finishWithLens(chosen);
    setSession('done');
  };
  const replay = (): void => {
    setSession('replay');
    setScene(FIRST_SCENE);
  };

  return {
    view: prologueView(session, completedAt !== undefined),
    ...noteAndKey,
    scene,
    interacted,
    completedAt,
    lens,
    next: act(next),
    back: act(() => setScene(previousScene(scene))),
    skip: act(() => {
      ensureKey();
      setScene(CHOOSE_SCENE);
    }),
    choose: act(choose),
    replay: act(replay),
  };
}
