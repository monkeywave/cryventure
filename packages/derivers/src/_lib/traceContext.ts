import type { AnyStateFacet, TraceBundle } from '@cryventure/core';
import {
  aesStateFacet,
  aesValuesFacet,
  locateAesOps,
  opStep,
  subkeyValueIds,
  valueIdByRole,
  type AesOpSteps,
} from './aesTrace.ts';

/** What the ISA derivers read from an AES op-detail bundle: its op steps and the value ids they reference. */
export interface TraceContext {
  facet: AnyStateFacet;
  ops: AesOpSteps;
  subkeys: ReadonlyMap<number, string>;
  plaintextId: string | undefined;
  ciphertextId: string | undefined;
  /** The step after which region `w` holds the whole key schedule. */
  keyScheduleStep: number;
}

const contexts = new WeakMap<TraceBundle, TraceContext>();

function readTraceContext(bundle: TraceBundle): TraceContext {
  const facet = aesStateFacet(bundle);
  const values = aesValuesFacet(bundle);
  const ops = locateAesOps(facet);
  return {
    facet,
    ops,
    subkeys: subkeyValueIds(values),
    plaintextId: valueIdByRole(values, 'plaintext'),
    ciphertextId: valueIdByRole(values, 'ciphertext'),
    keyScheduleStep: opStep(ops, 'keyExpansion', 0),
  };
}

/**
 * The bundle's trace context, computed once per bundle (bundles are immutable once recorded) and
 * shared by every ISA deriver that runs on it. Throws on a broken AES contract; failures are not cached.
 */
export function traceContext(bundle: TraceBundle): TraceContext {
  let context = contexts.get(bundle);
  if (context === undefined) {
    context = readTraceContext(bundle);
    contexts.set(bundle, context);
  }
  return context;
}
