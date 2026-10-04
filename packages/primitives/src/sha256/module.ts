import { runPrimitive, type PortMap, type RunOptions, type RunResult } from '@cryventure/core';
import { SHA256_ALGORITHMS } from '../_lib/sha2/algorithms.ts';
import { sha2HashFamily } from '../_lib/sha2/hash.ts';
import { hashMessageBytes } from '../_lib/hashKit/manifestKit.ts';
import { recordSha2 } from '../_lib/sha2/record.ts';
import { SHA256_ALGORITHM_IDS, sha256Manifest, type Sha256Params } from './manifest.ts';

/**
 * SHA-224/SHA-256 producer (FIPS 180-4 §6.2, §6.3): the shared SHA-2 recorder with 32-bit words,
 * emitting state, values, narration and wordops facets and `{ digest }`.
 */
const NS = 'plugin.sha256';

/** Validates `params`, records the hash (checked against the untraced reference) and returns a TraceBundle. */
export function run(params: Sha256Params, _options: RunOptions = {}): RunResult {
  return runPrimitive(sha256Manifest, params, ({ algorithm, encoding, input, detail }) =>
    recordSha2({ ns: NS, algorithm: SHA256_ALGORITHMS[algorithm], message: hashMessageBytes(encoding, input), detail }),
  );
}

/** The `Hash` port: SHA-224 and SHA-256, untraced. */
export const ports = { Hash: sha2HashFamily('sha256', SHA256_ALGORITHM_IDS) } satisfies Partial<PortMap>;
