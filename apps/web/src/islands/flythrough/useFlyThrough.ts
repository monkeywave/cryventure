import { useCallback, useEffect, useState } from 'react';
import { FLY_BEATS, stepBeat, type FlyImpl, type FlyTarget } from './flyThroughModel.ts';

/** Time per beat while playing. Playback only ever starts on a button press. */
export const BEAT_MS = 1600;

export interface FlyView {
  beat: number;
  impl: FlyImpl;
  target: FlyTarget;
}

export interface FlyThroughApi {
  view: FlyView;
  /** The view shown before the last change (for the reduced-motion cross-fade); `null` initially. */
  previous: FlyView | null;
  playing: boolean;
  isFirst: boolean;
  isLast: boolean;
  step: (delta: number) => void;
  togglePlay: () => void;
  setImpl: (impl: FlyImpl) => void;
  setTarget: (target: FlyTarget) => void;
}

const LAST_BEAT = FLY_BEATS.length - 1;

/** Beat, implementation and destination of the fly-through, plus a play loop that stops on the last beat. */
export function useFlyThrough(initial: Omit<FlyView, 'beat'>): FlyThroughApi {
  const [history, setHistory] = useState<{ view: FlyView; previous: FlyView | null }>({ view: { beat: 0, ...initial }, previous: null });
  const [playing, setPlaying] = useState(false);
  const change = useCallback((update: (view: FlyView) => FlyView) => {
    setHistory(({ view }) => {
      const next = update(view);
      return next.beat === view.beat && next.impl === view.impl && next.target === view.target ? { view, previous: null } : { view: next, previous: view };
    });
  }, []);
  const { view } = history;

  useEffect(() => {
    if (!playing) return;
    if (view.beat >= LAST_BEAT) {
      setPlaying(false);
      return;
    }
    const timer = setTimeout(() => change((current) => ({ ...current, beat: stepBeat(current.beat, 1) })), BEAT_MS);
    return () => clearTimeout(timer);
  }, [playing, view.beat, change]);

  const step = useCallback(
    (delta: number) => {
      setPlaying(false);
      change((current) => ({ ...current, beat: stepBeat(current.beat, delta) }));
    },
    [change],
  );
  const togglePlay = useCallback(() => {
    if (playing) return setPlaying(false);
    // At the end, Play starts over from the matrix.
    if (view.beat >= LAST_BEAT) change((current) => ({ ...current, beat: 0 }));
    setPlaying(true);
  }, [playing, view.beat, change]);
  const setImpl = useCallback((impl: FlyImpl) => change((current) => ({ ...current, impl })), [change]);
  const setTarget = useCallback((target: FlyTarget) => change((current) => ({ ...current, target })), [change]);

  return { view, previous: history.previous, playing, isFirst: view.beat === 0, isLast: view.beat >= LAST_BEAT, step, togglePlay, setImpl, setTarget };
}
