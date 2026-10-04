import type { AnyStateFacet, TraceBundle, ValuesFacet } from '@cryventure/core';
import {
  aesStateFacet,
  aesValuesFacet,
  locateAesOps,
  opStep,
  subkeyValueIds,
  valueIdByRole,
  type AesOpSteps,
} from './aesTrace.ts';
import { memoizePerBundle } from './traceFacets.ts';

/** What the ISA and memory derivers read from an AES op-detail bundle: its op steps and the value ids they reference. */
export interface TraceContext {
  facet: AnyStateFacet;
  values: ValuesFacet;
  ops: AesOpSteps;
  subkeys: ReadonlyMap<number, string>;
  keyId: string | undefined;
  plaintextId: string | undefined;
  ciphertextId: string | undefined;
  /** The step after which region `w` holds the whole key schedule. */
  keyScheduleStep: number;
}

function readTraceContext(bundle: TraceBundle): TraceContext {
  const facet = aesStateFacet(bundle);
  const values = aesValuesFacet(bundle);
  const ops = locateAesOps(facet);
  return {
    facet,
    values,
    ops,
    subkeys: subkeyValueIds(values),
    keyId: valueIdByRole(values, 'key'),
    plaintextId: valueIdByRole(values, 'plaintext'),
    ciphertextId: valueIdByRole(values, 'ciphertext'),
    keyScheduleStep: opStep(ops, 'keyExpansion', 0),
  };
}

/**
 * The bundle's trace context, computed once per bundle (bundles are immutable once recorded) and
 * shared by every ISA and memory deriver that runs on it. Throws on a broken AES contract; failures are not cached.
 */
export const traceContext: (bundle: TraceBundle) => TraceContext =
  memoizePerBundle(readTraceContext);
