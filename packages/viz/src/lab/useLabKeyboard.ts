import { useCallback, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import type { LabActions } from './createLabStore.ts';
import { useLabStore } from './LabContext.tsx';

export type LabKeyAction = keyof Pick<LabActions, 'prev' | 'next' | 'togglePlay' | 'first' | 'last'>;

const KEY_ACTIONS: Readonly<Record<string, LabKeyAction>> = {
  ArrowLeft: 'prev',
  ArrowRight: 'next',
  ' ': 'togglePlay',
  Home: 'first',
  End: 'last',
};

const TEXT_ENTRY = 'input, select, textarea, [contenteditable=""], [contenteditable="true"]';
const ACTIVATABLE = 'button, a[href], summary, [role="button"], [role="tab"]';

/** Elements that own these keys themselves (sliders, text fields, Space on buttons). */
function ownsKey(key: string, target: Element | null): boolean {
  if (target === null) return false;
  if (target.closest(TEXT_ENTRY) !== null) return true;
  return key === ' ' && target.closest(ACTIVATABLE) !== null;
}

/** Maps a keydown to a lab action, or `null` when the key is not ours or the target owns it. */
export function keyToAction(event: Pick<KeyboardEvent, 'key' | 'altKey' | 'ctrlKey' | 'metaKey' | 'shiftKey'>, target: Element | null): LabKeyAction | null {
  if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return null;
  const action = KEY_ACTIONS[event.key];
  if (action === undefined || ownsKey(event.key, target)) return null;
  return action;
}

/**
 * ←/→/Space/Home/End drive the player. Returns a React `onKeyDown` handler for the lab
 * container, so it only sees keys while focus is inside, and runs after nested handlers
 * (grids, tablists) that claim a key with `preventDefault()`.
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
