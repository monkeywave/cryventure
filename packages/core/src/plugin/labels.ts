import type { ScopeLevel } from '../facets/state.ts';
import type { OpLabels } from '../registry.ts';

/**
 * Label keys a plugin declares by convention under its namespace: scope levels
 * (`<ns>.scope.<level>`, `…Next`, `…Prev`) and op labels (`<ns>.op.<op>`, `<ns>.opShort.<op>`).
 */

/** Scope levels, outermost first, e.g. `scopeLevels('plugin.aes', 'round', 'op')`. */
export function scopeLevels(namespace: string, ...levels: string[]): ScopeLevel[] {
  return levels.map((level) => ({
    labelKey: `${namespace}.scope.${level}`,
    nextKey: `${namespace}.scope.${level}Next`,
    prevKey: `${namespace}.scope.${level}Prev`,
  }));
}

/** The `ops` labels of a manifest, one entry per op name. */
export function opLabels<Op extends string>(namespace: string, names: readonly Op[]): Record<Op, OpLabels> {
  return Object.fromEntries(names.map((op) => [op, { labelKey: `${namespace}.op.${op}`, shortLabelKey: `${namespace}.opShort.${op}` }])) as Record<Op, OpLabels>;
}
