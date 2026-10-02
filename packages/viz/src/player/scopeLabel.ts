import type { StateFacet, Translate } from '@cryventure/core';

/** Message keys per scope depth; deeper levels reuse the last key. Params: `index`, `ordinal` (index + 1). */
export const DEFAULT_SCOPE_LEVEL_KEYS: readonly string[] = ['ui.scope.round', 'ui.scope.op', 'ui.scope.sub'];

/**
 * Template params of one scope level: `index`/`value` = the raw scope index, `ordinal` = index + 1,
 * `n` = the 1-based level index (see `StateFacet.scopeLevels` in core).
 */
export function scopeParams(index: number, depth: number): Record<string, number> {
  return { index, ordinal: index + 1, value: index, n: depth + 1 };
}

/**
 * "Round 3 · op 2" for scope `[3, 1]`; empty string for the root scope.
 * `deepestLabel` (e.g. the step's op label "SubBytes") replaces the template of the deepest declared
 * level — only when the scope actually reaches it — giving "Round 3 · SubBytes".
 */
export function formatScopePath(
  scope: readonly number[],
  t: Translate,
  levelKeys: readonly string[] = DEFAULT_SCOPE_LEVEL_KEYS,
  deepestLabel?: string,
): string {
  const lastKey = levelKeys.at(-1);
  if (lastKey === undefined) return '';
  const deepest = levelKeys.length - 1;
  return scope
    .map((index, depth) => (depth === deepest && deepestLabel !== undefined ? deepestLabel : t(levelKeys[depth] ?? lastKey, scopeParams(index, depth))))
    .join(t('ui.scope.separator'));
}

/** The producer's `scopeLevels` label keys when declared, else the viz defaults. */
export function scopeLevelKeys(facet: Pick<StateFacet<string, { op: string }>, 'scopeLevels'> | undefined): readonly string[] {
  const keys = facet?.scopeLevels?.map((level) => level.labelKey);
  return keys !== undefined && keys.length > 0 ? keys : DEFAULT_SCOPE_LEVEL_KEYS;
}

/** Scope path of `step` in a state facet; the initial step (-1) has the root scope `[]`. */
export function scopeAt(facet: Pick<StateFacet<string, { op: string }>, 'steps'> | undefined, step: number): readonly number[] {
  return facet?.steps[step]?.scope ?? [];
}
