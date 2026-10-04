import { runPrimitive, type PortMap, type RunOptions, type RunResult } from '@cryventure/core';
import { kmacFamily } from '../_lib/keccak/kmac.ts';
import { kmacManifest, type KmacParams } from './manifest.ts';
import { recordKmac } from './record.ts';

/**
 * kmac producer (SP 800-185 §4): KMAC and KMACXOF traced on the cSHAKE sponge, emitting state, values,
 * sponge and narration facets and `{ tag }`.
 */

/** Validates `params`, records the sponge (checked against the untraced KMAC) and returns a TraceBundle. */
export function run(params: KmacParams, _options: RunOptions = {}): RunResult {
  return runPrimitive(kmacManifest, params, recordKmac);
}

/** The `Mac` port: KMAC128 and KMAC256 with real incremental contexts on the hi/lo sponge (KMACXOF is lab-only). Untraced. */
export const ports = { Mac: kmacFamily('kmac') } satisfies Partial<PortMap>;
