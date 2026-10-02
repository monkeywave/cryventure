import type { StateFacet, Translate } from '@cryventure/core';

/** Message keys per scope depth; deeper levels reuse the last key. Params: `index`, `ordinal` (index + 1). */
export const DEFAULT_SCOPE_LEVEL_KEYS: readonly string[] = ['ui.scope.round', 'ui.scope.op', 'ui.scope.sub'];

/** "Round 3 · op 2" for scope `[3, 1]`; empty string for the root scope. */
export function formatScopePath(scope: readonly number[], t: Translate, levelKeys: readonly string[] = DEFAULT_SCOPE_LEVEL_KEYS): string {
  const lastKey = levelKeys.at(-1);
  if (lastKey === undefined) return '';
  return scope
    .map((index, depth) => t(levelKeys[depth] ?? lastKey, { index, ordinal: index + 1 }))
    .join(t('ui.scope.separator'));
}

/** Scope path of `step` in a state facet; the initial step (-1) has the root scope `[]`. */
export function scopeAt(facet: Pick<StateFacet<string, { op: string }>, 'steps'> | undefined, step: number): readonly number[] {
  return facet?.steps[step]?.scope ?? [];
}
