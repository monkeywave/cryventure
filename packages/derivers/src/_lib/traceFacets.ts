import {
  getFacet,
  type AnyStateFacet,
  type FacetKind,
  type Snapshot,
  type TraceBundle,
} from '@cryventure/core';

/**
 * What every trace reader (AES `aesTrace.ts`, SHA `sha/shaTrace.ts`) does the same way: name a broken
 * producer contract, require the facets it reads, slice words out of a state snapshot, and read a
 * bundle once (bundles are immutable once recorded).
 */

/** `<contract> trace contract: <message>`, e.g. `AES trace contract: no state facet`. */
export function traceContractError(contract: string, message: string): Error {
  return new Error(`${contract} trace contract: ${message}`);
}

/** The bundle's `kind` facet; throws `no <kind> facet` under `contract` when it is missing. */
export function requiredFacet<T>(bundle: TraceBundle, kind: FacetKind, contract: string): T {
  const facet = getFacet<T>(bundle, kind);
  if (facet === undefined) throw traceContractError(contract, `no ${kind} facet`);
  return facet;
}

/** The bundle's state facet with every region of `regions`; throws under `contract` otherwise. */
export function requiredStateFacet(
  bundle: TraceBundle,
  regions: readonly string[],
  contract: string,
): AnyStateFacet {
  const facet = requiredFacet<AnyStateFacet>(bundle, 'state', contract);
  for (const region of regions)
    if (!facet.regions.some((spec) => spec.id === region))
      throw traceContractError(contract, `no "${region}" region`);
  return facet;
}

/** `length` bytes of `region` from `offset` in a snapshot, or `undefined` when the region is shorter. */
export function regionSlice(
  snapshot: Snapshot<string>,
  region: string,
  offset: number,
  length: number,
): number[] | undefined {
  const bytes = snapshot[region]?.slice(offset, offset + length);
  return bytes?.length === length ? [...bytes] : undefined;
}

/** `read` memoised per bundle; a throw is not cached, so a broken bundle throws on every call. */
export function memoizePerBundle<T>(read: (bundle: TraceBundle) => T): (bundle: TraceBundle) => T {
  const cache = new WeakMap<TraceBundle, T>();
  return (bundle) => {
    if (cache.has(bundle)) return cache.get(bundle) as T;
    const value = read(bundle);
    cache.set(bundle, value);
    return value;
  };
}
