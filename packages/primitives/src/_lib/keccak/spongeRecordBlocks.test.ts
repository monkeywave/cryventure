import { i18nRef, toHex } from '@cryventure/core';
import { describe, expect, it } from 'vitest';
import { initialSnapshot } from '../sha2/regions.ts';
import { KECCAK_ALGORITHMS } from './algorithms.ts';
import type { Sha3OpName } from './manifestKit.ts';
import { DOMAIN_SUFFIXES, spongePad } from './padding.ts';
import { sponge } from './sponge.ts';
import { SpongeRecorder } from './spongeRecorder.ts';
import { recordSpongeBlocks, spongeRegions } from './spongeRecording.ts';
import { recordPad, type SpongeRegion, type SpongeTrace } from './spongeSteps.ts';

/** docs/M6.md §2b: the block/squeeze loop of a recorded sponge run, on SHAKE128 (rate 168) with a 3-byte input. */

const NS = 'plugin.sha3';
const ALGORITHM = KECCAK_ALGORITHMS.shake128;
const INPUT = Uint8Array.of(0x61, 0x62, 0x63);

function recordShake128(outputLength: number) {
  const padded = spongePad(INPUT, ALGORITHM.rateBytes, DOMAIN_SUFFIXES.shake);
  const regions = spongeRegions(NS, padded.padded.length, outputLength);
  const recorder = new SpongeRecorder<SpongeRegion, Sha3OpName>(regions, initialSnapshot(regions, {}), i18nRef(`${NS}.step.initial`));
  const trace: SpongeTrace = { recorder, algorithm: ALGORITHM, detail: 'permutation', ns: NS };
  const result = recordSpongeBlocks(trace, {
    padded,
    outputLength,
    prelude: (state) => recordPad(trace, state, padded, i18nRef(`${NS}.step.pad`), []),
    outputNarration: () => i18nRef(`${NS}.step.output`),
  });
  return { ...result, state: recorder.stateFacet([]), spongeFacet: recorder.spongeFacet(i18nRef(`${NS}.sponge.label`), 21) };
}

describe('recordSpongeBlocks', () => {
  it.each([32, 168, 400])('outputs the reference sponge bytes for %i bytes', (outputLength) => {
    expect(toHex(Uint8Array.from(recordShake128(outputLength).output))).toBe(toHex(sponge(INPUT, ALGORITHM.rateBytes, DOMAIN_SUFFIXES.shake, outputLength)));
  });

  it('records pad, absorb, permutation and squeeze in block 0, then the output as the last step', () => {
    const { state, spongeFacet, outputStep } = recordShake128(32);
    expect(state.steps.map((step) => [step.op, step.scope])).toEqual([['pad', [0, 0]], ['absorb', [0, 1]], ['permute', [0, 2]], ['squeeze', [0, 3]], ['output', [0, 4]]]);
    expect(spongeFacet.steps.map((step) => step.phase)).toEqual(['pad', 'absorb', 'permute', 'squeeze', 'output']);
    expect(outputStep).toBe(4);
  });

  it('gives every further squeeze (and its permutation) its own block scope, writing the output region in rate-sized pieces', () => {
    const { state, outputStep } = recordShake128(400);
    expect(state.steps.map((step) => [step.op, step.scope])).toEqual([
      ['pad', [0, 0]], ['absorb', [0, 1]], ['permute', [0, 2]], ['squeeze', [0, 3]],
      ['permute', [1, 0]], ['squeeze', [1, 1]],
      ['permute', [2, 0]], ['squeeze', [2, 1]], ['output', [2, 2]],
    ]);
    const squeezeWrites = state.steps.filter((step) => step.op === 'squeeze').map((step) => step.writes.filter((write) => write.region === 'output').map((write) => [write.offset, write.values.length]));
    expect(squeezeWrites).toEqual([[[0, 168]], [[168, 168]], [[336, 64]]]);
    expect(outputStep).toBe(8);
  });
});
