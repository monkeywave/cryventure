import type { Translate } from '@cryventure/core';
import type { GridRowHeader } from '@cryventure/viz';

/** Visible word label: the producer's symbol plus the index (`w0`, `w1`, …); data, not prose. */
export function wordLabel(labelPrefix: string, index: number): string {
  return `${labelPrefix}${index}`;
}

/** One header per word row: `<prefix><i>` plus a translated accessible label that names the current words. */
export function wordHeaders(count: number, current: ReadonlySet<number>, t: Translate, labelPrefix: string): GridRowHeader[] {
  return Array.from({ length: count }, (_, index) => {
    const isCurrent = current.has(index);
    const label = t(isCurrent ? 'view.state.wordCurrent' : 'view.state.word', { index });
    return { text: wordLabel(labelPrefix, index), label, current: isCurrent };
  });
}
