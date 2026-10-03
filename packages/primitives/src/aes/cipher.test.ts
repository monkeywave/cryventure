import { stateAt, toHex, unwrittenAt } from '@cryventure/core';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import type { AesOp, AesRegion } from './aesTrace.ts';
import { decryptBlock, encryptBlock, encryptWithSchedule } from './cipher.ts';
import { keySchedule } from './keyExpansion.ts';
import type { AesStateFacet } from './module.ts';
import { hexBytes, recordingTracerFor } from './testHelpers.ts';
import vectors from './vectors/fips197.json';

const appendixB = vectors.appendixB;

function recordEncryption(
  keyHex: string,
  ptHex: string,
  detail: 'op' | 'round' = 'op',
): AesStateFacet {
  const key = hexBytes(keyHex);
  const tracer = recordingTracerFor(key.length);
  encryptBlock(key, hexBytes(ptHex), tracer, detail);
  return tracer.toFacet();
}

function stepIndex(facet: AesStateFacet, round: number, op: AesOp['op']): number {
  const index = facet.steps.findIndex((step) => step.round === round && step.op === op);
  if (index < 0) throw new Error(`no ${op} in round ${round}`);
  return index;
}

function regionHexAfter(
  facet: AesStateFacet,
  round: number,
  op: AesOp['op'],
  region: AesRegion = 'state',
): string {
  return toHex(stateAt(facet, stepIndex(facet, round, op))[region]);
}

describe('encryptBlock — FIPS 197 App. B conformance (op-level stateAt)', () => {
  const facet = recordEncryption(appendixB.key, appendixB.input);

  for (const vector of appendixB.rounds) {
    it(`round ${vector.round} matches start/s_box/s_row/m_col/k_sch`, () => {
      const round = vector.round;
      expect(regionHexAfter(facet, round - 1, 'addRoundKey'), 'start').toBe(vector.start);
      expect(regionHexAfter(facet, round, 'subBytes'), 's_box').toBe(vector.s_box);
      expect(regionHexAfter(facet, round, 'shiftRows'), 's_row').toBe(vector.s_row);
      if (vector.m_col !== null)
        expect(regionHexAfter(facet, round, 'mixColumns'), 'm_col').toBe(vector.m_col);
      expect(regionHexAfter(facet, round, 'addRoundKey', 'roundKey'), 'k_sch').toBe(vector.k_sch);
    });
  }

  it('ends with the App. B output in the state', () => {
    expect(regionHexAfter(facet, 10, 'output')).toBe(appendixB.output);
  });

  it('round-level trace has one step per round whose state equals the next round start', () => {
    const rounds = recordEncryption(appendixB.key, appendixB.input, 'round');
    expect(rounds.steps).toHaveLength(11);
    expect(rounds.steps.map((step) => step.scope)).toEqual(
      Array.from({ length: 11 }, (_, r) => [r]),
    );
    appendixB.rounds.forEach((vector, r) =>
      expect(toHex(stateAt(rounds, r).state)).toBe(vector.start),
    );
    expect(toHex(stateAt(rounds, 10).state)).toBe(appendixB.output);
  });
});

describe('encryptBlock / decryptBlock — FIPS 197 App. C', () => {
  for (const vector of vectors.appendixC) {
    it(`${vector.section}: encrypts to and decrypts from the expected ciphertext`, () => {
      const key = hexBytes(vector.key);
      expect(toHex(encryptBlock(key, hexBytes(vector.plaintext)))).toBe(vector.ciphertext);
      expect(toHex(decryptBlock(key, hexBytes(vector.ciphertext)))).toBe(vector.plaintext);
    });
  }

  it.each([
    [16, 43],
    [24, 51],
    [32, 59],
  ])('a %i-byte key yields %i op-level steps (4·Nr + 3)', (keyLength, steps) => {
    const vector = vectors.appendixC.find((v) => v.key.length === keyLength * 2)!;
    expect(recordEncryption(vector.key, vector.plaintext).steps).toHaveLength(steps);
  });
});

const arbitraryBytes = (length: number) =>
  fc.array(fc.integer({ min: 0, max: 255 }), { minLength: length, maxLength: length });
const arbitraryKey = fc.constantFrom(16, 24, 32).chain(arbitraryBytes);

describe('properties', () => {
  it('decryptBlock(encryptBlock(x)) == x for all key sizes', () => {
    fc.assert(
      fc.property(arbitraryKey, arbitraryBytes(16), (key, block) => {
        expect(decryptBlock(key, encryptBlock(key, block))).toEqual(block);
      }),
      { numRuns: 200 },
    );
  });

  it('NullTracer and RecordingTracer (op and round detail) produce the same output', () => {
    fc.assert(
      fc.property(arbitraryKey, arbitraryBytes(16), (key, block) => {
        const fast = encryptBlock(key, block);
        expect(encryptBlock(key, block, recordingTracerFor(key.length), 'op')).toEqual(fast);
        expect(encryptBlock(key, block, recordingTracerFor(key.length), 'round')).toEqual(fast);
        expect(decryptBlock(key, fast, recordingTracerFor(key.length))).toEqual(block);
      }),
      { numRuns: 50 },
    );
  });

  it('the recorded final state equals the returned ciphertext', () => {
    fc.assert(
      fc.property(arbitraryKey, arbitraryBytes(16), (key, block) => {
        const tracer = recordingTracerFor(key.length);
        const ciphertext = encryptBlock(key, block, tracer);
        const facet = tracer.toFacet();
        expect(stateAt(facet, facet.steps.length - 1).state).toEqual(ciphertext);
      }),
      { numRuns: 30 },
    );
  });
});

describe('blank initial regions', () => {
  const unwrittenCounts = (facet: AesStateFacet, step: number) =>
    Object.fromEntries([...unwrittenAt(facet, step)].map(([region, indices]) => [region, indices.size]));

  it('starts with every region not yet written (nothing is loaded before the input step)', () => {
    expect(unwrittenCounts(recordEncryption(appendixB.key, appendixB.input), -1)).toEqual({ state: 16, roundKey: 16, w: 176 });
  });

  it('has written each region by the step that first reads it (input, key expansion, first AddRoundKey)', () => {
    const facet = recordEncryption(appendixB.key, appendixB.input);
    expect(unwrittenAt(facet, stepIndex(facet, 0, 'input')).get('state')?.size).toBe(0);
    expect(unwrittenAt(facet, stepIndex(facet, 0, 'keyExpansion')).get('w')?.size).toBe(0);
    expect(unwrittenCounts(facet, stepIndex(facet, 0, 'addRoundKey'))).toEqual({ state: 0, roundKey: 0, w: 0 });
  });

  it('is fully written by the first AddRoundKey when decrypting too', () => {
    const key = hexBytes(appendixB.key);
    const tracer = recordingTracerFor(key.length);
    decryptBlock(key, hexBytes(appendixB.output), tracer);
    const facet = tracer.toFacet();
    const firstAddRoundKey = facet.steps.findIndex((step) => step.op === 'addRoundKey');
    expect(unwrittenCounts(facet, firstAddRoundKey)).toEqual({ state: 0, roundKey: 0, w: 0 });
  });
});

describe('decryptBlock trace', () => {
  it('uses inverse ops and round keys in reverse order', () => {
    const key = hexBytes(appendixB.key);
    const tracer = recordingTracerFor(16);
    decryptBlock(key, hexBytes(appendixB.output), tracer);
    const steps = tracer.toFacet().steps;
    expect(steps.map((step) => step.op).slice(0, 7)).toEqual([
      'input',
      'keyExpansion',
      'addRoundKey',
      'invShiftRows',
      'invSubBytes',
      'addRoundKey',
      'invMixColumns',
    ]);
    const roundKeyOrder = steps.flatMap((step) =>
      step.op === 'addRoundKey' ? [step.roundKeyIndex] : [],
    );
    expect(roundKeyOrder).toEqual([10, 9, 8, 7, 6, 5, 4, 3, 2, 1, 0]);
  });
});

describe('encryptWithSchedule', () => {
  it('matches encryptBlock (same ciphertext and trace) with a pre-expanded key', () => {
    const key = hexBytes(appendixB.key);
    const viaKey = recordingTracerFor(16);
    const viaSchedule = recordingTracerFor(16);
    const ciphertext = encryptWithSchedule(keySchedule(key), hexBytes(appendixB.input), viaSchedule);
    expect(toHex(ciphertext)).toBe(appendixB.output);
    encryptBlock(key, hexBytes(appendixB.input), viaKey);
    expect(viaSchedule.toFacet()).toEqual(viaKey.toFacet());
  });
});
