import { describe, expect, it } from 'vitest';
import { getFacet } from '@cryventure/core';
import { INITIAL_STEP, type AnyStateFacet, type AnyStateStep } from '@cryventure/viz';
import { runProducer } from './labSession.ts';
import { producerRegistry } from './registry.ts';
import { mapStepAcrossTraces } from './stepMapping.ts';

const C1_KEY = '000102030405060708090a0b0c0d0e0f';
const C3_KEY = '000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f';
const PLAINTEXT = '00112233445566778899aabbccddeeff';

async function aesFacet(keyHex: string, detail: 'op' | 'round'): Promise<AnyStateFacet> {
  const result = await runProducer(producerRegistry.get('aes')!, { keyHex, plaintextHex: PLAINTEXT, detail });
  if (!result.ok) throw new Error('AES run failed');
  const facet = getFacet<AnyStateFacet>(result.trace, 'state');
  if (facet === undefined) throw new Error('no state facet');
  return facet;
}

type AesStep = AnyStateStep & { round: number };
const stepAt = (facet: AnyStateFacet, step: number) => facet.steps[step] as AesStep;
const indexOf = (facet: AnyStateFacet, round: number, op: string) => facet.steps.findIndex((step) => (step as AesStep).round === round && step.op === op);

const fine128 = await aesFacet(C1_KEY, 'op');
const coarse128 = await aesFacet(C1_KEY, 'round');
const fine256 = await aesFacet(C3_KEY, 'op');

describe('mapStepAcrossTraces', () => {
  it('keeps the step when the trace has the same shape', async () => {
    expect(mapStepAcrossTraces(fine128, 17, await aesFacet(C1_KEY, 'op'))).toBe(17);
  });

  it('keeps the initial state', () => {
    expect(mapStepAcrossTraces(fine128, INITIAL_STEP, coarse128)).toBe(INITIAL_STEP);
  });

  it('op → round detail: step 30 (round 7) lands on the round-7 step', () => {
    expect(stepAt(fine128, 30).round).toBe(7);
    expect(stepAt(coarse128, mapStepAcrossTraces(fine128, 30, coarse128))).toMatchObject({ op: 'round', round: 7 });
  });

  it('round → op detail: lands on the first step of the same round', () => {
    const round7 = indexOf(coarse128, 7, 'round');
    expect(mapStepAcrossTraces(coarse128, round7, fine128)).toBe(fine128.steps.findIndex((step) => (step as AesStep).round === 7));
  });

  it('AES-256 → AES-128: an op both traces share keeps its meaning (same round and op)', () => {
    const from = indexOf(fine256, 5, 'mixColumns');
    expect(stepAt(fine128, mapStepAcrossTraces(fine256, from, fine128))).toMatchObject({ op: 'mixColumns', round: 5 });
  });

  it('AES-256 round 13 → AES-128 (no round 13): clamps to the last step', () => {
    const from = indexOf(fine256, 13, 'mixColumns');
    const mapped = mapStepAcrossTraces(fine256, from, fine128);
    expect(Math.min(mapped, fine128.steps.length - 1)).toBe(fine128.steps.length - 1);
  });

  it('without an old facet the raw index is kept (left to the store to clamp)', () => {
    expect(mapStepAcrossTraces(undefined, 12, coarse128)).toBe(12);
  });
});
