import type { Translate } from '@cryventure/core';
import type { GridRowHeader } from '@cryventure/viz';

/** Visible word label in standard notation (`w0`, `w1`, …); a symbol, not prose. */
export function wordLabel(index: number): string {
  return `w${index}`;
}

/** One header per word row: `w<i>` plus a translated accessible label that names the current words. */
export function wordHeaders(count: number, current: ReadonlySet<number>, t: Translate): GridRowHeader[] {
  return Array.from({ length: count }, (_, index) => {
    const isCurrent = current.has(index);
    const label = t(isCurrent ? 'view.state.wordCurrent' : 'view.state.word', { index });
    return { text: wordLabel(index), label, current: isCurrent };
  });
}
