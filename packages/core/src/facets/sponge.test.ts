import { describe, expect, it } from 'vitest';
import { validateSpongeFacet, type SpongeFacet, type SpongeStep } from './sponge.ts';

/** A tiny 2 × 2 sponge of 8-bit lanes, 3 rounds, 1 rate lane (shapes stay generic, as for Ascon). */
const zero = '00';
const lanes = (...values: string[]): string[] => values;

function validFacet(): SpongeFacet {
  return {
    kind: 'sponge',
    schemaVersion: 1,
    label: { key: 'plugin.toy.sponge.label' },
    width: 2,
    height: 2,
    laneBits: 8,
    rounds: 3,
    rateLanes: 1,
    rhoOffsets: [0, 1, 7, 3],
    piSource: [0, 2, 3, 1],
    steps: [
      { step: 0, phase: 'pad', lanes: lanes(zero, zero, zero, zero) },
      { step: 1, phase: 'absorb', lanes: lanes('61', zero, zero, zero), input: ['61'] },
      { step: 2, phase: 'theta', round: 0, lanes: lanes('61', '61', zero, zero), theta: { c: ['61', '00'], d: ['00', 'c2'], partial: ['61', '00'] } },
      { step: 3, phase: 'iota', round: 0, lanes: lanes('60', '61', zero, zero), iota: { rc: '01' } },
      { step: 4, phase: 'round', round: 2, lanes: lanes('ff', '61', zero, zero) },
      { step: 5, phase: 'permute', lanes: lanes('ff', '61', zero, zero) },
      { step: 6, phase: 'output', lanes: lanes('ff', '61', zero, zero), output: 'ff' },
    ],
  };
}

function withStep(index: number, change: Partial<SpongeStep>): SpongeFacet {
  const facet = validFacet();
  facet.steps[index] = { ...facet.steps[index]!, ...change };
  return facet;
}

describe('validateSpongeFacet', () => {
  it('accepts a valid facet, with and without stepCount', () => {
    expect(validateSpongeFacet(validFacet())).toEqual([]);
    expect(validateSpongeFacet(validFacet(), 7)).toEqual([]);
  });

  it('accepts a 5 × 1 Ascon-like shape without ρ/π tables and an initial step −1', () => {
    const facet: SpongeFacet = { ...validFacet(), width: 5, height: 1, laneBits: 64, rounds: 12, rateLanes: 1, rhoOffsets: undefined, piSource: undefined, steps: [{ step: -1, phase: 'permute', lanes: Array(5).fill('0'.repeat(16)) }] };
    expect(validateSpongeFacet(facet)).toEqual([]);
  });

  it('rejects bad shape fields and stops there', () => {
    expect(validateSpongeFacet({ ...validFacet(), width: 0, rounds: 1.5, laneBits: 12 })).toEqual([
      'sponge: width 0 is not a positive integer',
      'sponge: rounds 1.5 is not a positive integer',
      'sponge: laneBits 12 is not 8, 16, 32 or 64',
    ]);
    expect(validateSpongeFacet({ ...validFacet(), rateLanes: 5 })).toEqual(['sponge: rateLanes 5 exceeds the 4 lanes']);
    expect(validateSpongeFacet({ ...validFacet(), schemaVersion: 2 })).toEqual(['sponge: schemaVersion 2 is not 1']);
  });

  it('rejects a malformed label', () => {
    expect(validateSpongeFacet({ ...validFacet(), label: { key: '' } })).toEqual(['sponge label: not a well-formed I18nRef']);
  });

  it('rejects lanes of the wrong count or width', () => {
    expect(validateSpongeFacet(withStep(0, { lanes: lanes(zero, zero, zero) }))).toEqual(['sponge step 0: lanes has 3 lanes, expected 4']);
    expect(validateSpongeFacet(withStep(0, { lanes: lanes('0', 'AB', zero, '0g') }))).toEqual([
      'sponge step 0: lanes[0] "0" is not 2 lowercase hex digits',
      'sponge step 0: lanes[1] "AB" is not 2 lowercase hex digits',
      'sponge step 0: lanes[3] "0g" is not 2 lowercase hex digits',
    ]);
  });

  it('rejects input that is not rateLanes lanes', () => {
    expect(validateSpongeFacet(withStep(1, { input: ['61', '00'] }))).toEqual(['sponge step 1: input has 2 lanes, expected 1']);
  });

  it('rejects θ entries that are not width lanes', () => {
    expect(validateSpongeFacet(withStep(2, { theta: { c: ['61'], d: ['00', 'c2'], partial: ['61', '00', '00'] } }))).toEqual([
      'sponge step 2: theta.c has 1 lanes, expected 2',
      'sponge step 2: theta.partial has 3 lanes, expected 2',
    ]);
  });

  it('rejects a bad ι constant and output', () => {
    expect(validateSpongeFacet(withStep(3, { iota: { rc: '1' } }))).toEqual(['sponge step 3: iota.rc "1" is not 2 lowercase hex digits']);
    expect(validateSpongeFacet(withStep(6, { output: 'f' }))).toEqual(['sponge step 6: output "f" is not lowercase hex bytes']);
  });

  it('rejects rounds out of range and round phases without a round', () => {
    expect(validateSpongeFacet(withStep(4, { round: 3 }))).toEqual(['sponge step 4: round 3 outside 0..2']);
    expect(validateSpongeFacet(withStep(2, { round: undefined }))).toEqual(['sponge step 2: phase theta has no round']);
  });

  it('rejects an unknown phase', () => {
    expect(validateSpongeFacet(withStep(5, { phase: 'stir' as SpongeStep['phase'] }))).toEqual(['sponge step 5: phase "stir" is not a SpongePhase']);
  });

  it('rejects ρ offsets out of range and a π map that is not a permutation', () => {
    expect(validateSpongeFacet({ ...validFacet(), rhoOffsets: [0, 8, -1, 3] })).toEqual(['sponge: rhoOffsets[1] 8 outside 0..7', 'sponge: rhoOffsets[2] -1 outside 0..7']);
    expect(validateSpongeFacet({ ...validFacet(), rhoOffsets: [0] })).toEqual(['sponge: rhoOffsets is not an array of 4 offsets']);
    expect(validateSpongeFacet({ ...validFacet(), piSource: [0, 1, 1, 3] })).toEqual(['sponge: piSource is not a permutation of 0..3']);
    expect(validateSpongeFacet({ ...validFacet(), piSource: [0, 1, 2, 4] })).toEqual(['sponge: piSource is not a permutation of 0..3']);
  });

  it('rejects non-increasing steps and steps outside stepCount', () => {
    expect(validateSpongeFacet(withStep(1, { step: 0 }))).toEqual(['sponge: step 0 does not increase (after 0)']);
    expect(validateSpongeFacet(validFacet(), 6)).toEqual(['sponge: step 6 outside -1..5']);
    expect(validateSpongeFacet(withStep(0, { step: -2 }))).toEqual(['sponge: step -2 is not an integer ≥ -1']);
  });
});

describe('validateSpongeFacet on malformed input (never throws)', () => {
  const base = validFacet();
  const malformed: [string, unknown][] = [
    ['null', null],
    ['an array', []],
    ['no steps', { ...base, steps: undefined }],
    ['a null step', { ...base, steps: [null] }],
    ['a step without lanes', { ...base, steps: [{ step: 0, phase: 'pad' }] }],
    ['symbol lanes', { ...base, steps: [{ step: 0, phase: 'pad', lanes: [Symbol('x'), 1, null, {}] }] }],
    ['theta null', { ...base, steps: [{ ...base.steps[2], theta: null }] }],
    ['theta parts not arrays', { ...base, steps: [{ ...base.steps[2], theta: { c: 'x', d: 3 } }] }],
    ['iota not an object', { ...base, steps: [{ ...base.steps[3], iota: 'rc' }] }],
    ['a symbol step', { ...base, steps: [{ ...base.steps[0], step: Symbol('s') }] }],
    ['string shape fields', { ...base, width: '5' }],
  ];

  it.each(malformed)('returns problems instead of throwing for %s', (_name, facet) => {
    let problems: string[] = [];
    expect(() => { problems = validateSpongeFacet(facet); }).not.toThrow();
    expect(problems.length).toBeGreaterThan(0);
  });

  it('names the shape problem', () => {
    expect(validateSpongeFacet(null)).toEqual(['sponge: facet is not an object']);
    expect(validateSpongeFacet({ ...base, steps: {} })).toEqual(['sponge: steps is not an array']);
    expect(validateSpongeFacet({ ...base, steps: [null] })).toEqual(['sponge steps[0]: not an object']);
  });
});
