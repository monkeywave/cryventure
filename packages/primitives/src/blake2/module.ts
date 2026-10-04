import { parseHexToArray, runPrimitive, type PortMap, type RunOptions, type RunResult } from '@cryventure/core';
import { blake2HashFamily } from '../_lib/blake2/hash.ts';
import { BLAKE2_ALGORITHMS } from '../_lib/blake2/variants.ts';
import { blake2Manifest, type Blake2Params } from './manifest.ts';
import { hashMessageBytes } from '../_lib/hashKit/manifestKit.ts';
import { recordBlake2 } from './record.ts';

/**
 * BLAKE2s/BLAKE2b producer (RFC 7693): emits state, values, narration and wordops (v2) facets and
 * `{ digest }`; the `Hash` port offers the eight unkeyed functions, untraced.
 */
const NS = 'plugin.blake2';

/** Validates `params`, records the hash (checked against the untraced reference) and returns a TraceBundle. */
export function run(params: Blake2Params, _options: RunOptions = {}): RunResult {
  return runPrimitive(blake2Manifest, params, ({ algorithm, encoding, input, key, detail }) =>
    recordBlake2({ ns: NS, algorithm: BLAKE2_ALGORITHMS[algorithm], message: hashMessageBytes(encoding, input), key: parseHexToArray(key), detail }),
  );
}

/** The `Hash` port: the eight unkeyed BLAKE2 functions of RFC 7693 §4. */
export const ports = { Hash: blake2HashFamily('blake2') } satisfies Partial<PortMap>;
