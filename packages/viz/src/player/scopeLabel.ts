import type { AnyStateFacet, Translate } from '@cryventure/core';

/**
 * Template params of one scope level: `index`/`value` = the raw scope index, `ordinal` = index + 1,
 * `n` = the 1-based level index (see `StateFacet.scopeLevels` in core).
 */
export function scopeParams(index: number, depth: number): Record<string, number> {
  return { index, ordinal: index + 1, value: index, n: depth + 1 };
}

/**
 * "Round 3 · op 2" for scope `[3, 1]` (one message key per depth; deeper levels reuse the last key);
 * empty string for the root scope or without level keys.
 * `deepestLabel` (e.g. the step's op label "SubBytes") replaces the template of the deepest declared
 * level — only when the scope actually reaches it — giving "Round 3 · SubBytes".
 */
export function formatScopePath(
  scope: readonly number[],
  t: Translate,
  levelKeys: readonly string[],
  deepestLabel?: string,
): string {
  const lastKey = levelKeys.at(-1);
  if (lastKey === undefined) return '';
  const deepest = levelKeys.length - 1;
  return scope
    .map((index, depth) => (depth === deepest && deepestLabel !== undefined ? deepestLabel : t(levelKeys[depth] ?? lastKey, scopeParams(index, depth))))
    .join(t('ui.scope.separator'));
}

/**
 * The producer's `scopeLevels` label keys; none when it declares no levels. A producer without
 * declared levels (e.g. a flat XOR or byte-order trace) gets no scope label at all — the player
 * must not invent AES-style "Round n" labels for it; "Step x / n" stays the only position text.
 */
export function scopeLevelKeys(facet: Pick<AnyStateFacet, 'scopeLevels'> | undefined): readonly string[] {
  return facet?.scopeLevels?.map((level) => level.labelKey) ?? [];
}

/** Scope path of `step` in a state facet; the initial step (-1) has the root scope `[]`. */
export function scopeAt(facet: Pick<AnyStateFacet, 'steps'> | undefined, step: number): readonly number[] {
  return facet?.steps[step]?.scope ?? [];
}
