import { describe, expect, it } from 'vitest';
import { sharedSha3FixtureBundle } from './fixtures/keccakBundles.ts';
import { syntheticPermutation } from './fixtures/keccakChecks.ts';
import { keccakTrace } from './keccakTrace.ts';
import {
  expectValue,
  expectValueSet,
  KeccakRegisterFile,
  lowHalf,
  registerBytes,
  roundInput,
  valueBytes,
  ZERO,
} from './keccakValues.ts';

describe('roundInput', () => {
  const permutation = syntheticPermutation();

  it('reads the entry step in round 0, χ of the round before for lanes 1–24, ι for lane 0', () => {
    expect(roundInput(permutation, 0, 7)).toEqual({ kind: 'lane', step: 1, lane: 7 });
    expect(roundInput(permutation, 1, 7)).toEqual({ kind: 'lane', step: 5, lane: 7 });
    expect(roundInput(permutation, 1, 0)).toEqual({ kind: 'lane', step: 6, lane: 0 });
    expect(roundInput(permutation, 24, 0)).toEqual({ kind: 'lane', step: 121, lane: 0 });
  });
});

describe('valueBytes', () => {
  const trace = keccakTrace(sharedSha3FixtureBundle('sha3-256-abc'));

  it('reads lanes, θ intermediates and RC from the trace, little-endian', () => {
    expect(valueBytes(trace, { kind: 'lane', step: 1, lane: 0 })).toEqual([
      0x61, 0x62, 0x63, 0x06, 0, 0, 0, 0,
    ]);
    expect(valueBytes(trace, { kind: 'lane', step: 1, lane: 16 })).toEqual([
      0, 0, 0, 0, 0, 0, 0, 0x80,
    ]);
    expect(valueBytes(trace, { kind: 'rc', step: 6 })).toEqual([1, 0, 0, 0, 0, 0, 0, 0]);
    expect(valueBytes(trace, { kind: 'theta', step: 2, part: 'partial', x: 0 })).toEqual([
      0x61, 0x62, 0x63, 0x06, 0, 0, 0, 0,
    ]);
    expect(valueBytes(trace, ZERO)).toEqual(new Array(8).fill(0));
  });

  it('throws when the trace has no such value', () => {
    expect(() => valueBytes(trace, { kind: 'rc', step: 2 })).toThrow('the trace records no RC@2');
    expect(() => valueBytes(trace, { kind: 'lane', step: 999, lane: 0 })).toThrow(
      'no sponge step at state step 999',
    );
  });

  it('lays a register out low half first', () => {
    expect(registerBytes(trace, lowHalf({ kind: 'rc', step: 6 }))).toEqual([
      1,
      ...new Array(15).fill(0),
    ]);
  });
});

describe('expectations', () => {
  const a = { kind: 'lane', step: 1, lane: 2 } as const;
  const b = { kind: 'rc', step: 6 } as const;

  it('compare one value or a set of values in any order', () => {
    expect(() => expectValue(a, a, 'x')).not.toThrow();
    expect(() => expectValue(a, b, 'v1')).toThrow('v1: expected RC@6, holds lane 2@1');
    expect(() => expectValueSet([a, b], [b, a], 'x')).not.toThrow();
    expect(() => expectValueSet([a, a], [a, b], 'pair')).toThrow('pair: expected {RC@6, lane 2@1}');
  });
});

describe('KeccakRegisterFile', () => {
  it('reads what was written, forgets restored registers and keeps spilled stack slots', () => {
    const file = new KeccakRegisterFile();
    file.write('v1', lowHalf(ZERO));
    expect(file.read('v1')).toEqual({ low: ZERO, high: ZERO });
    file.forget('v1');
    expect(() => file.read('v1')).toThrow('v1 is read before it is written');
    expect(() => file.readStack(0)).toThrow('[sp, #0] is reloaded before a spill');
    file.writeStack(0, lowHalf(ZERO));
    expect(file.readStack(0)).toEqual(lowHalf(ZERO));
  });
});
