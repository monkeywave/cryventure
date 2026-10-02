import { useCallback, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import type { LabActions } from './createLabStore.ts';
import { useLabStore } from './LabContext.tsx';

export type LabKeyAction = keyof Pick<
  LabActions,
  'prev' | 'next' | 'togglePlay' | 'first' | 'last' | 'prevScope' | 'nextScope' | 'toggleCurrentBreakpoint'
>;

const KEY_ACTIONS: Readonly<Record<string, LabKeyAction>> = {
  ArrowLeft: 'prev',
  ArrowRight: 'next',
  ' ': 'togglePlay',
  Home: 'first',
  End: 'last',
  b: 'toggleCurrentBreakpoint',
  B: 'toggleCurrentBreakpoint',
};

/** Shift + key: coarser navigation (by section, the outermost scope level). */
const SHIFT_KEY_ACTIONS: Readonly<Record<string, LabKeyAction>> = {
  ArrowLeft: 'prevScope',
  ArrowRight: 'nextScope',
  B: 'toggleCurrentBreakpoint',
};

const TEXT_ENTRY = 'input, select, textarea, [contenteditable=""], [contenteditable="true"]';
const ACTIVATABLE = 'button, a[href], summary, [role="button"], [role="tab"]';

/** Elements that own these keys themselves (sliders, text fields, Space on buttons). */
function ownsKey(key: string, target: Element | null): boolean {
  if (target === null) return false;
  if (target.closest(TEXT_ENTRY) !== null) return true;
  return key === ' ' && target.closest(ACTIVATABLE) !== null;
}

type KeyInfo = Pick<KeyboardEvent, 'key' | 'altKey' | 'ctrlKey' | 'metaKey' | 'shiftKey'>;

/** Maps a keydown to a lab action, or `null` when the key is not ours or the target owns it. */
export function keyToAction(event: KeyInfo, target: Element | null): LabKeyAction | null {
  if (event.altKey || event.ctrlKey || event.metaKey) return null;
  const action = (event.shiftKey ? SHIFT_KEY_ACTIONS : KEY_ACTIONS)[event.key];
  if (action === undefined || ownsKey(event.key, target)) return null;
  return action;
}

/**
 * ←/→ (Shift: by section), Space, Home/End and B (breakpoint) drive the player. Returns a React
 * `onKeyDown` handler for the lab container, so it only sees keys while focus is inside, and runs
 * after nested handlers (grids, tablists) that claim a key with `preventDefault()`.
 */
export function useLabKeyboard(): (event: ReactKeyboardEvent<HTMLElement>) => void {
  const store = useLabStore();
  return useCallback(
    (event) => {
      if (event.defaultPrevented) return;
      const action = keyToAction(event, event.target instanceof Element ? event.target : null);
      if (action === null) return;
      event.preventDefault();
      store.getState()[action]();
    },
    [store],
  );
}
