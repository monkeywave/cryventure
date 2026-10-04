import { toHex } from '@cryventure/core';
import { describe, expect, it } from 'vitest';
import { KECCAK_ALGORITHMS } from './algorithms.ts';
import { fromHiLoState, keccakF1600HiLo, toHiLoState, zeroHiLoState } from './hilo.ts';
import { squeezeFromHiLo } from './portSponge.ts';
import { squeezeFrom } from './sponge.ts';

/** docs/M7.md §2a: the hi/lo squeeze equals the `bigint` reference squeeze from the same absorbed state. */

const absorbedState = () => keccakF1600HiLo(zeroHiLoState());

describe('squeezeFromHiLo', () => {
  it.each([
    [KECCAK_ALGORITHMS.shake128.rateBytes, 0],
    [KECCAK_ALGORITHMS.shake128.rateBytes, 16],
    [KECCAK_ALGORITHMS.shake128.rateBytes, 168],
    [KECCAK_ALGORITHMS.shake128.rateBytes, 169],
    [KECCAK_ALGORITHMS['sha3-256'].rateBytes, 400],
    [KECCAK_ALGORITHMS['sha3-512'].rateBytes, 72 * 3 + 5],
  ])('equals the bigint squeeze at rate %i for %i bytes (multi-block included)', (rateBytes, outputLength) => {
    const reference = squeezeFrom(fromHiLoState(absorbedState()), rateBytes, outputLength);
    expect(toHex(squeezeFromHiLo(absorbedState(), rateBytes, outputLength))).toBe(toHex(reference));
  });

  it('reads only the rate part of the state for a single-block squeeze', () => {
    const state = toHiLoState(Array.from({ length: 25 }, (_, lane) => BigInt(lane + 1)));
    expect(Array.from(squeezeFromHiLo(state, 16, 16))).toEqual([1, 0, 0, 0, 0, 0, 0, 0, 2, 0, 0, 0, 0, 0, 0, 0]);
  });
});
