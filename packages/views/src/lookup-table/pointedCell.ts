/**
 * The hovered or focused cell of a lookup table (`null` = none). Kept outside React state so pointing
 * at cells re-renders only the caption that reads it, never the 256-cell grid.
 */
export interface PointedCell {
  get(): number | null;
  set(index: number | null): void;
  subscribe(listener: () => void): () => void;
}

export function createPointedCell(): PointedCell {
  let pointed: number | null = null;
  const listeners = new Set<() => void>();
  return {
    get: () => pointed,
    set(index) {
      if (index === pointed) return;
      pointed = index;
      listeners.forEach((listener) => listener());
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
