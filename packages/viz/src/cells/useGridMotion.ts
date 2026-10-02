import { useLayoutEffect, useMemo, useSyncExternalStore, type RefObject } from 'react';
import { createGridMotionRunner, planGridMotion, type GridMotion } from './gridMotion.ts';

const noSubscription = () => () => {};
const ZERO = () => 0;

/** Flat index → cell element of one grid, built once per step. */
function cellLookup(grid: HTMLElement): (index: number) => HTMLElement | undefined {
  const byIndex = new Map<number, HTMLElement>();
  grid.querySelectorAll<HTMLElement>('[data-index]').forEach((cell) => byIndex.set(Number(cell.dataset['index']), cell));
  return (index) => byIndex.get(index);
}

/**
 * Runs a grid's choreography with ONE progress listener for the whole grid: CSS custom properties
 * are written per frame only where they changed, and the grid re-renders only when a value switch
 * flips. Returns whether the cell at a flat index shows its after value.
 */
export function useGridMotion(gridRef: RefObject<HTMLElement | null>, motion: GridMotion | undefined, values: readonly number[]): (index: number) => boolean {
  const progress = motion?.progress;
  const nodes = useMemo(() => planGridMotion(motion, values), [motion, values]);
  const runner = useMemo(() => (progress === undefined || nodes.length === 0 ? undefined : createGridMotionRunner(nodes, progress.get())), [nodes, progress]);

  useLayoutEffect(() => {
    const grid = gridRef.current;
    if (runner === undefined || progress === undefined || grid === null) return undefined;
    runner.attach(cellLookup(grid));
    runner.update(progress.get());
    const unsubscribe = progress.on('change', runner.update);
    return () => {
      unsubscribe();
      runner.detach();
    };
  }, [gridRef, runner, progress]);

  useSyncExternalStore(runner?.subscribe ?? noSubscription, runner === undefined ? ZERO : () => runner.version, runner === undefined ? ZERO : () => runner.version);
  return runner === undefined ? () => true : runner.showsAfter;
}
