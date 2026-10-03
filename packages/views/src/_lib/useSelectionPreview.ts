import { useMemo } from 'react';
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
