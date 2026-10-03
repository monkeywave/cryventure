import {
  assertMatchesReference,
  ghash,
  INITIAL_STEP_INDEX,
  narrationFromState,
  parseHexToArray,
  runPrimitive,
  valueRef,
  type RunOptions,
  type RunResult,
  type ValuesFacet,
} from '@cryventure/core';
import { recordGhash, NS } from './ghashTrace.ts';
import { GHASH_BLOCK_BYTES, ghashManifest, type GhashParams } from './manifest.ts';

/** GHASH producer: Yᵢ = (Yᵢ₋₁ ⊕ Bᵢ) • H, Y₀ = 0, output Yₘ, with state/values/narration/field facets. */

/** Splits validated, block-aligned input into 16-byte blocks. */
export function ghashBlocks(input: readonly number[]): number[][] {
  return Array.from({ length: input.length / GHASH_BLOCK_BYTES }, (_, i) => input.slice(i * GHASH_BLOCK_BYTES, (i + 1) * GHASH_BLOCK_BYTES));
}

/** H and the input exist from the initial state on (step −1); the hash after the last step. */
function ghashValues(h: number[], input: number[], result: number[], lastStep: number): ValuesFacet {
  return {
    kind: 'values',
    schemaVersion: 1,
    values: [valueRef(NS, 'h', 'subkey', h, INITIAL_STEP_INDEX), valueRef(NS, 'input', 'public', input, INITIAL_STEP_INDEX), valueRef(NS, 'ghash', 'state', result, lastStep)],
  };
}

/** Validates `params`, records GHASH (checked against core's untraced `ghash`) and returns a TraceBundle. */
export function run(params: GhashParams, _options: RunOptions = {}): RunResult {
  return runPrimitive(ghashManifest, params, ({ hHex, inputHex, detail }) => {
    const h = parseHexToArray(hHex);
    const input = parseHexToArray(inputHex);
    const recording = recordGhash(h, ghashBlocks(input), detail);
    const result = recording.ys[recording.ys.length - 1]!;
    assertMatchesReference(result, ghash(Uint8Array.from(h), Uint8Array.from(input)), 'ghash');
    const state = recording.state;
    return {
      facets: {
        state,
        values: ghashValues(h, input, result, state.steps.length - 1),
        narration: narrationFromState(state),
        field: recording.field,
      },
      output: { ghash: result },
    };
  });
}
