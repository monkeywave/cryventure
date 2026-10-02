import type { DerivationFacet } from '@cryventure/core';
import { sourceWordIds } from './keyScheduleModel.ts';

/**
 * Which words are marked as sources of the previewed (hovered / focused) or else selected word.
 * Kept outside React state so a hover re-renders only the words whose mark flips.
 */
export interface SourceMarks {
  preview(id: string | null): void;
  select(id: string | null): void;
  isSource(id: string): boolean;
  subscribe(listener: () => void): () => void;
}

const NONE: ReadonlySet<string> = new Set();

export function createSourceMarks(facet: DerivationFacet): SourceMarks {
  let previewId: string | null = null;
  let selectedId: string | null = null;
  let markedId: string | null = null;
  let sources = NONE;
  const listeners = new Set<() => void>();

  const refresh = () => {
    const next = previewId ?? selectedId;
    if (next === markedId) return;
    markedId = next;
    sources = next === null ? NONE : new Set(sourceWordIds(facet, next));
    listeners.forEach((listener) => listener());
  };

  return {
    preview(id) {
      previewId = id;
      refresh();
    },
    select(id) {
      selectedId = id;
      refresh();
    },
    isSource: (id) => sources.has(id),
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
