import { runPrimitive, type PortMap, type RunOptions, type RunResult } from '@cryventure/core';
import { SHA1_FAMILY } from '../_lib/legacy-md/hash.ts';
import { recordLegacy } from '../_lib/legacy-md/record.ts';
import { sha2MessageBytes } from '../_lib/sha2/record.ts';
import { SHA1_ALGORITHM } from '../_lib/legacy-md/sha1Detail.ts';
import { sha1Manifest, type Sha1Params } from './manifest.ts';

/**
 * SHA-1 producer (FIPS 180-4 §6.1): the shared MD5/SHA-1 recorder with big-endian words and the
 * message schedule, emitting state, values, narration and wordops (v2) facets and `{ digest }`.
 */
const NS = 'plugin.sha1';

/** Validates `params`, records the hash (checked against the untraced reference) and returns a TraceBundle. */
export function run(params: Sha1Params, _options: RunOptions = {}): RunResult {
  return runPrimitive(sha1Manifest, params, ({ encoding, input, detail }) => recordLegacy({ ns: NS, algorithm: SHA1_ALGORITHM, message: sha2MessageBytes(encoding, input), detail }));
}

/** The `Hash` port: family `sha1` with the function `sha-1`, untraced. */
export const ports = { Hash: SHA1_FAMILY } satisfies Partial<PortMap>;
