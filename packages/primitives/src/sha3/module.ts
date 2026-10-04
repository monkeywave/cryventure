import { runPrimitive, type PortMap, type RunOptions, type RunResult } from '@cryventure/core';
import { hmacFamily } from '../_lib/hmac/family.ts';
import { keccakHashFamily } from '../_lib/keccak/hash.ts';
import { SHA3_HMAC_HASH_IDS, sha3Manifest, type Sha3Params } from './manifest.ts';
import { recordSha3 } from './record.ts';

/**
 * sha3 producer (FIPS 202, SP 800-185): the traced Keccak sponge, emitting state, values, sponge and
 * narration facets and `{ digest }`.
 */

/** Validates `params`, records the sponge (checked against the untraced reference) and returns a TraceBundle. */
export function run(params: Sha3Params, _options: RunOptions = {}): RunResult {
  return runPrimitive(sha3Manifest, params, recordSha3);
}

const Hash = keccakHashFamily('sha3');

/**
 * The `Hash` port: SHA3-224 … 512 and Keccak-256, plus the XOFs SHAKE128/256 and cSHAKE128/256; the
 * `Mac` port: HMAC-SHA3-224 … 512 with B = the rate (FIPS 198-1, SP 800-224). Untraced.
 */
export const ports = { Hash, Mac: hmacFamily(Hash, 'sha3', SHA3_HMAC_HASH_IDS) } satisfies Partial<PortMap>;
