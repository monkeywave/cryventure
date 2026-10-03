import type { TraceBundle, ValuesFacet } from '@cryventure/core';
import {
  aesStateFacet,
  aesValuesFacet,
  locateAesOps,
  opStep,
  requiredSubkeyId,
  roundKeyBytesAt,
  stateBytesAt,
  subkeyValueIds,
  valueIdByRole,
} from '../_lib/aesTrace.ts';

/**
 * The few facts the memory deriver reads from the AES producer's published facet contract
 * (docs/M4.md §1b), through the same reader as the ISA derivers (`_lib/aesTrace`, one rule for
 * ops, rounds and subkey → round): ops `input`/`keyExpansion`/`output`, regions `state` and `w`,
 * and the `values` facet's `subkey`/`key`/`plaintext`/`ciphertext` entries. Never the producer's
 * code. A broken contract throws, so a renamed op or region fails the contract kit.
 */

export interface AesRun {
  /** Number of state steps. */
  stepCount: number;
  /** State-step indices of the ops the model writes at. */
  steps: { input: number; keyExpansion: number; output: number };
  /** AES rounds Nr (10/12/14). */
  rounds: number;
  /** Round keys 0..Nr with the id of their `subkey` value. */
  roundKeys: { valueId: string; bytes: number[] }[];
  plaintext: number[];
  ciphertext: number[];
  /** Value ids, when the values facet has them. */
  valueIds: { key?: string; plaintext?: string; ciphertext?: string };
}

function sameBytes(a: readonly number[], b: readonly number[]): boolean {
  return a.length === b.length && a.every((byte, index) => byte === b[index]);
}

/** Each subkey value must hold the bytes of its round key in `w` after keyExpansion. */
function assertSubkeysMatchSchedule(values: ValuesFacet, roundKeys: AesRun['roundKeys']): void {
  const byId = new Map(values.values.map((value) => [value.id, value.bytes]));
  for (const { valueId, bytes } of roundKeys) {
    if (!sameBytes(byId.get(valueId) ?? [], bytes))
      throw new Error(`AES trace contract: region "w" after keyExpansion does not match the subkey values (${valueId})`);
  }
}

/** Reads one AES op-detail encryption from its state and values facets. */
export function readAesRun(bundle: TraceBundle): AesRun {
  const state = aesStateFacet(bundle);
  const values = aesValuesFacet(bundle);
  const ops = locateAesOps(state);
  const steps = { input: opStep(ops, 'input', 0), keyExpansion: opStep(ops, 'keyExpansion', 0), output: opStep(ops, 'output', ops.rounds) };
  const subkeys = subkeyValueIds(values);
  const roundKeys = Array.from({ length: ops.rounds + 1 }, (_, round) => ({
    valueId: requiredSubkeyId(subkeys, round),
    bytes: roundKeyBytesAt(state, steps.keyExpansion, round),
  }));
  assertSubkeysMatchSchedule(values, roundKeys);
  return {
    stepCount: ops.stepCount,
    steps,
    rounds: ops.rounds,
    roundKeys,
    plaintext: stateBytesAt(state, steps.input),
    ciphertext: stateBytesAt(state, steps.output),
    valueIds: {
      key: valueIdByRole(values, 'key'),
      plaintext: valueIdByRole(values, 'plaintext'),
      ciphertext: valueIdByRole(values, 'ciphertext'),
    },
  };
}
