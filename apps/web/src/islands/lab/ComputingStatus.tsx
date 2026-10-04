import { useEffect, useState } from 'react';
import { useT } from '@cryventure/viz';

/** A run shorter than this never shows "Computing…", so fast labs do not flicker (docs/M7.md §4). */
export const COMPUTING_DELAY_MS = 300;

/** `flag`, but turning true only once it stayed true for `delayMs`; it turns false at once. */
export function useDelayedFlag(flag: boolean, delayMs: number): boolean {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    if (!flag) return undefined;
    const timer = setTimeout(() => setShown(true), delayMs);
    return () => {
      clearTimeout(timer);
      setShown(false);
    };
  }, [flag, delayMs]);
  return flag && shown;
}

/**
 * A progress-free "Computing…" line for a re-run still pending after `COMPUTING_DELAY_MS` (e.g. a
 * PBKDF2 worker run). The live region stays mounted, so screen readers announce the text when it appears.
 */
export function ComputingStatus({ computing }: { computing: boolean }) {
  const t = useT();
  const shown = useDelayedFlag(computing, COMPUTING_DELAY_MS);
  return (
    <p className="cv-lab__computing" role="status" aria-live="polite" data-computing={shown}>
      {shown ? t('ui.lab.computing') : ''}
    </p>
  );
}
