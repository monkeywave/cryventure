import { runPrimitive, type PortMap, type RunOptions, type RunResult } from '@cryventure/core';
import { keccakHashFamily } from '../_lib/keccak/hash.ts';
import { sha3Manifest, type Sha3Params } from './manifest.ts';
import { recordSha3 } from './record.ts';

/**
 * sha3 producer (FIPS 202, SP 800-185): the traced Keccak sponge, emitting state, values, sponge and
 * narration facets and `{ digest }`.
 */

/** Validates `params`, records the sponge (checked against the untraced reference) and returns a TraceBundle. */
export function run(params: Sha3Params, _options: RunOptions = {}): RunResult {
  return runPrimitive(sha3Manifest, params, recordSha3);
}

/** The `Hash` port: SHA3-224 … 512 and Keccak-256, plus the XOFs SHAKE128/256 and cSHAKE128/256, untraced. */
export const ports = { Hash: keccakHashFamily('sha3') } satisfies Partial<PortMap>;
