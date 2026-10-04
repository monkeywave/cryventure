import { runPrimitive, type PortMap, type RunOptions, type RunResult } from '@cryventure/core';
import { MD5_FAMILY } from '../_lib/legacy-md/hash.ts';
import { MD5_ALGORITHM } from '../_lib/legacy-md/md5Detail.ts';
import { legacyMessageBytes, recordLegacy } from '../_lib/legacy-md/record.ts';
import { md5Manifest, type Md5Params } from './manifest.ts';

/**
 * MD5 producer (RFC 1321): the shared MD5/SHA-1 recorder with little-endian words, emitting state,
 * values, narration and wordops (v2) facets and `{ digest }`.
 */
const NS = 'plugin.md5';

/** Validates `params`, records the hash (checked against the untraced reference) and returns a TraceBundle. */
export function run(params: Md5Params, _options: RunOptions = {}): RunResult {
  return runPrimitive(md5Manifest, params, ({ encoding, input, detail }) => recordLegacy({ ns: NS, algorithm: MD5_ALGORITHM, message: legacyMessageBytes(encoding, input), detail }));
}

/** The `Hash` port: family `md5` with the function `md5`, untraced. */
export const ports = { Hash: MD5_FAMILY } satisfies Partial<PortMap>;
