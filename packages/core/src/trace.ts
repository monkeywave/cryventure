export type KnownFacetKind =
  | 'state'
  | 'values'
  | 'narration'
  | 'instructions'
  | 'registers'
  | 'memory'
  | 'derivation'
  | 'messages'
  | 'packets'
  | 'filesystem'
  | 'math'
  | 'table'
  | 'chain'
  | 'wire';

/** Open union: known kinds autocomplete, new kinds need no core change. */
export type FacetKind = KnownFacetKind | (string & {});

/** `kind@variant`, e.g. `state@default`, `memory@x86_64-linux-gnu`, `memory@recorded`. */
export type FacetKey = `${FacetKind}@${string}`;

export const DEFAULT_VARIANT = 'default';

export type ProducerKind = 'primitive' | 'protocol' | 'composite' | 'import';

export interface TraceBundle {
  schemaVersion: 1;
  producer: { kind: ProducerKind; id: string; apiVersion: number };
  provenance: 'modeled' | 'recorded';
  params: unknown;
  facets: Partial<Record<FacetKey, unknown>>;
  output: Record<string, number[]>;
  children?: TraceBundle[];
}

const KEY_SEPARATOR = '@';

export function facetKey(kind: FacetKind, variant: string = DEFAULT_VARIANT): FacetKey {
  if (kind === '' || kind.includes(KEY_SEPARATOR) || variant === '') {
    throw new RangeError(`facetKey: invalid kind "${kind}" or variant "${variant}"`);
  }
  return `${kind}${KEY_SEPARATOR}${variant}`;
}

/** Splits at the first `@`; returns `undefined` for malformed keys. */
export function parseFacetKey(key: string): { kind: FacetKind; variant: string } | undefined {
  const at = key.indexOf(KEY_SEPARATOR);
  if (at <= 0 || at === key.length - 1) return undefined;
  return { kind: key.slice(0, at), variant: key.slice(at + 1) };
}

/** Looks up a facet by kind and variant; the caller asserts its type. */
export function getFacet<T>(bundle: TraceBundle, kind: FacetKind, variant: string = DEFAULT_VARIANT): T | undefined {
  return bundle.facets[facetKey(kind, variant)] as T | undefined;
}

/** Distinct facet kinds present in the bundle (any variant), in insertion order. */
export function availableFacetKinds(bundle: TraceBundle): FacetKind[] {
  const kinds = Object.keys(bundle.facets)
    .filter((key) => bundle.facets[key as FacetKey] !== undefined)
    .map((key) => parseFacetKey(key)?.kind)
    .filter((kind): kind is FacetKind => kind !== undefined);
  return [...new Set(kinds)];
}
