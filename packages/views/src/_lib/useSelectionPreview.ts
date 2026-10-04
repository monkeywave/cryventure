import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useLabStore } from '@cryventure/viz';

export interface SelectionPreview {
  /** Publishes `valueRef` as the lab-wide selection (hover/focus). */
  preview: (valueRef: string) => void;
  /** Clears the selection on leave/blur, unless another view changed it meanwhile. */
  release: (valueRef: string) => void;
}

/** Transient lab selection for hover/focus previews, shared by views that link values. */
export function useSelectionPreview(): SelectionPreview {
  const store = useLabStore();
  return useMemo(
    () => ({
      preview: (valueRef) => store.getState().select(valueRef),
      release: (valueRef) => {
        if (store.getState().selection.valueRefId === valueRef) store.getState().select(null);
      },
    }),
    [store],
  );
}

export interface SelectionPreviewHandlers {
  onMouseEnter: () => void;
  onFocus: () => void;
  onClick: () => void;
  onMouseLeave: () => void;
  onBlur: () => void;
}

/**
 * Hover/focus/click handlers that publish `valueRef`; leave/blur releases it. An element that stays
 * mounted while its `valueRef` changes (e.g. a row keyed by term id across steps) releases the old
 * ref and, while still hovered or focused, publishes the new one; unmounting while hovered or focused
 * releases it too. A selection this element did not publish is never touched.
 */
export function useSelectionPreviewHandlers(valueRef: string): SelectionPreviewHandlers {
  const { preview, release } = useSelectionPreview();
  const active = useRef(false);
  const enter = useCallback(() => {
    active.current = true;
    preview(valueRef);
  }, [preview, valueRef]);
  const leave = useCallback(() => {
    active.current = false;
    release(valueRef);
  }, [release, valueRef]);
  useEffect(() => {
    const pointer = active;
    if (pointer.current) preview(valueRef);
    return () => {
      if (pointer.current) release(valueRef);
    };
  }, [preview, release, valueRef]);
  return useMemo(
    () => ({ onMouseEnter: enter, onFocus: enter, onClick: enter, onMouseLeave: leave, onBlur: leave }),
    [enter, leave],
  );
}
