export type ValueRole =
  | 'key'
  | 'subkey'
  | 'nonce'
  | 'plaintext'
  | 'ciphertext'
  | 'state'
  | 'secret'
  | 'public'
  | 'constant'
  | 'tag';

/** A named byte value with a lifetime on the shared timeline; the backbone of linked brushing. */
export interface ValueRef {
  /** Path-derived id (see `valueId`), stable across lazy recomputation. */
  id: string;
  labelKey: string;
  role: ValueRole;
  bytes: number[];
  createdAt: number;
  destroyedAt?: number;
}

export interface ValuesFacet {
  kind: 'values';
  schemaVersion: 1;
  values: ValueRef[];
}

const PATH_SEPARATOR = '/';

/** Deterministic id `scopePath/name`, e.g. `valueId([0, 3], 'roundKey')` → `"0/3/roundKey"`. */
export function valueId(scopePath: readonly (number | string)[], name: string): string {
  if (name === '' || name.includes(PATH_SEPARATOR)) {
    throw new RangeError(`valueId: name must be non-empty and contain no "${PATH_SEPARATOR}" (got "${name}")`);
  }
  return [...scopePath.map(String), name].join(PATH_SEPARATOR);
}

/**
 * A plugin value: id `valueId(scopePath, name)`, label `<namespace>.value.<name>`, e.g.
 * `valueRef('plugin.xor', 'key', 'key', bytes, 1)`.
 */
export function valueRef(
  namespace: string,
  name: string,
  role: ValueRole,
  bytes: number[],
  createdAt: number,
  scopePath: readonly (number | string)[] = [],
): ValueRef {
  return { id: valueId(scopePath, name), labelKey: `${namespace}.value.${name}`, role, bytes, createdAt };
}
