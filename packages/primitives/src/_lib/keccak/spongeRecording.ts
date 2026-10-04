import { allIndices, i18nRef, INITIAL_STEP_INDEX, scopeLevels, toHex, type I18nRef, type RegionSpec, type ScopeLevel } from '@cryventure/core';
import { KECCAK_LANE_BYTES, KECCAK_STATE_BYTES, KECCAK_WIDTH } from './constants.ts';
import { zeroState, type KeccakState } from './lanes.ts';
import type { Sha3Detail } from './manifestKit.ts';
import type { SpongePadding } from './padding.ts';
import { recordAbsorb, recordOutput, recordPermutation, recordSqueeze, type SpongeRegion, type SpongeTrace } from './spongeSteps.ts';

/**
 * The block structure of a recorded sponge run, shared by `sha3` and `kmac` (docs/M6.md §2b,
 * docs/M7.md §2c): the regions `padded`, `A`, `output`, the scope levels, the loop over blocks
 * and squeezes, and the `output` step's narration.
 */

/** A byte region `id` of `size` bytes labelled `<ns>.region.<id>`, the shape of every sponge producer's region. */
export function byteRegion<R extends string>(ns: string, id: R, size: number, extra: Partial<RegionSpec<R>> = {}): RegionSpec<R> {
  return { id, labelKey: `${ns}.region.${id}`, elem: 'u8', shape: [size], ...extra };
}

/** The sponge regions of a run (namespace `ns`): the `padded` input, the state `A` (25 little-endian lanes, five per row y) and the `output` (blank until squeezed). */
export function spongeRegions(ns: string, paddedBytes: number, outputBytes: number): RegionSpec<SpongeRegion>[] {
  const region = (id: SpongeRegion, size: number, extra: Partial<RegionSpec<SpongeRegion>> = {}) => byteRegion(ns, id, size, extra);
  return [
    region('padded', paddedBytes, { initial: 'blank' }),
    region('A', KECCAK_STATE_BYTES, { layout: { kind: 'words', wordBytes: KECCAK_LANE_BYTES, labelPrefix: 'A', wordsPerGroup: KECCAK_WIDTH, byteOrder: 'little' } }),
    region('output', outputBytes, { initial: 'blank' }),
  ];
}

/** block → round → op at `mapping` detail, block → op otherwise (labels `<ns>.scope.*`). */
export function spongeScopeLevels(ns: string, detail: Sha3Detail): ScopeLevel[] {
  return detail === 'mapping' ? scopeLevels(ns, 'block', 'round', 'op') : scopeLevels(ns, 'block', 'op');
}

/** The byte counts of the successive squeezes: whole rate blocks, then the rest. */
export function squeezeSizes(rateBytes: number, outputLength: number): number[] {
  return allIndices(Math.ceil(outputLength / rateBytes)).map((n) => Math.min(rateBytes, outputLength - n * rateBytes));
}

/**
 * The `output` step's narration: `<ns>.step.outputXof` with the byte count for an XOF, `<ns>.step.output`
 * with the bit count otherwise; the output as hex under `valueName` (`digest`, `tag`).
 */
export function spongeOutputNarration(ns: string, algorithmName: string, xof: boolean, valueName: string, output: readonly number[]): I18nRef {
  const params = { algorithm: algorithmName, [valueName]: toHex(output) };
  return xof ? i18nRef(`${ns}.step.outputXof`, { ...params, bytes: output.length }) : i18nRef(`${ns}.step.output`, { ...params, bits: output.length * 8 });
}

/** How the recorded blocks start and end. */
export interface SpongeBlocks {
  padded: SpongePadding;
  outputLength: number;
  /** Records the steps before the first absorb (at least `pad`) in block 0's scope; the state is still 0^b. */
  prelude: (state: KeccakState) => void;
  /** The narration of the `output` step. */
  outputNarration: (output: readonly number[]) => I18nRef;
}

/**
 * The prelude, then per block absorb + permutation, each block in its own scope; the first squeeze
 * ends the last absorbed block, every further squeeze (with the permutation before it) gets its own
 * block scope after it, and the output follows the last squeeze.
 */
export function recordSpongeBlocks<R extends string, O extends string>(trace: SpongeTrace<R, O>, blocks: SpongeBlocks): { output: number[]; outputStep: number } {
  const { padded } = blocks;
  const { rateBytes } = trace.algorithm;
  const sizes = squeezeSizes(rateBytes, blocks.outputLength);
  const lastScope = padded.blocks + sizes.length - 2;
  const output: number[] = [];
  let state = zeroState();
  let outputStep = INITIAL_STEP_INDEX;
  const squeeze = (scope: number, n: number) => {
    output.push(...recordSqueeze(trace, state, output.length, sizes[n - 1]!, n));
    if (scope === lastScope) outputStep = recordOutput(trace, state, output, blocks.outputNarration(output));
  };
  for (let index = 0; index < padded.blocks; index++) {
    trace.recorder.scope(index, () => {
      if (index === 0) blocks.prelude(state);
      state = recordAbsorb(trace, state, padded.padded.subarray(index * rateBytes, (index + 1) * rateBytes), index);
      state = recordPermutation(trace, state, index + 1);
      if (index === padded.blocks - 1) squeeze(index, 1);
    });
  }
  for (let n = 2; n <= sizes.length; n++) {
    const scope = padded.blocks + n - 2;
    trace.recorder.scope(scope, () => {
      state = recordPermutation(trace, state, scope + 1);
      squeeze(scope, n);
    });
  }
  return { output, outputStep };
}
