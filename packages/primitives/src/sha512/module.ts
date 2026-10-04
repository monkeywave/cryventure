import { runPrimitive, type PortMap, type RunOptions, type RunResult } from '@cryventure/core';
import { SHA512_ALGORITHMS } from '../_lib/sha2/algorithms.ts';
import { sha2HashFamily } from '../_lib/sha2/hash.ts';
import { recordSha2, sha2MessageBytes } from '../_lib/sha2/record.ts';
import { SHA512_HASH_IDS, sha512Manifest, type Sha512Params } from './manifest.ts';

/**
 * SHA-384/SHA-512/SHA-512/224/SHA-512/256 producer (FIPS 180-4 §6.4–6.7) and the SHA-512/t IV
 * generation function (§5.3.6): the shared SHA-2 recorder with 64-bit words, emitting state,
 * values, narration and wordops facets and `{ digest }`. The IV generation function carries its
 * `ivGeneration` in the algorithm catalog, so the recorder narrates it as such.
 */
const NS = 'plugin.sha512';

/** Validates `params`, records the hash (checked against the untraced reference) and returns a TraceBundle. */
export function run(params: Sha512Params, _options: RunOptions = {}): RunResult {
  return runPrimitive(sha512Manifest, params, ({ algorithm, encoding, input, detail }) =>
    recordSha2({ ns: NS, algorithm: SHA512_ALGORITHMS[algorithm], message: sha2MessageBytes(encoding, input), detail }),
  );
}

/**
 * The `Hash` port: the four standard functions, untraced. The SHA-512/t IV generation function
 * (`sha-512/t-iv`) is deliberately absent: it is a step of FIPS 180-4 §5.3.6 for deriving IVs, not
 * a standard hash function, so no consumer may pick it as one.
 */
export const ports = { Hash: sha2HashFamily('sha512', SHA512_HASH_IDS) } satisfies Partial<PortMap>;
