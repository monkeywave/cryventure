import { toHex, type AnyStateFacet, type TraceBundle, type ValuesFacet } from '@cryventure/core';
import { describe, expect, it } from 'vitest';
import {
  aesStateFacet,
  aesValuesFacet,
  locateAesOps,
  opStep,
  roundKeyBytesAt,
  stateBytesAt,
  subkeyValueIds,
  valueIdByRole,
} from './aesTrace.ts';
import { aesFixtureBundle } from './fixtures/aesBundles.ts';

const c1 = () => aesFixtureBundle('fips197-c1');
const stateOf = (bundle: TraceBundle) => bundle.facets['state@default'] as AnyStateFacet;
const valuesOf = (bundle: TraceBundle) => bundle.facets['values@default'] as ValuesFacet;

describe('aesStateFacet / aesValuesFacet', () => {
  it('return the facets of a real bundle', () => {
    expect(aesStateFacet(c1()).kind).toBe('state');
    expect(aesValuesFacet(c1()).kind).toBe('values');
  });

  it('throw when a facet or a contract region is missing', () => {
    const noW = c1();
    stateOf(noW).regions = stateOf(noW).regions.filter((region) => region.id !== 'w');
    expect(() => aesStateFacet({ ...c1(), facets: {} })).toThrow(/no state facet/);
    expect(() => aesStateFacet(noW)).toThrow(/no "w" region/);
    expect(() => aesValuesFacet({ ...c1(), facets: {} })).toThrow(/no values facet/);
  });
});

describe('locateAesOps / opStep', () => {
  it('finds every op step of AES-128 (input, keyExpansion, ARK 0, then SB/SR/MC/ARK per round)', () => {
    const ops = locateAesOps(stateOf(c1()));
    expect(ops.rounds).toBe(10);
    expect(ops.stepCount).toBe(43);
    expect([
      opStep(ops, 'input', 0),
      opStep(ops, 'keyExpansion', 0),
      opStep(ops, 'addRoundKey', 0),
    ]).toEqual([0, 1, 2]);
    expect(
      ['subBytes', 'shiftRows', 'mixColumns', 'addRoundKey'].map((op) =>
        opStep(ops, op as 'subBytes', 1),
      ),
    ).toEqual([3, 4, 5, 6]);
    expect([
      opStep(ops, 'subBytes', 10),
      opStep(ops, 'addRoundKey', 10),
      opStep(ops, 'output', 10),
    ]).toEqual([39, 41, 42]);
  });

  it('reads Nr 12 and 14 for AES-192 and AES-256', () => {
    expect(locateAesOps(stateOf(aesFixtureBundle('fips197-c2'))).rounds).toBe(12);
    expect(locateAesOps(stateOf(aesFixtureBundle('fips197-c3'))).rounds).toBe(14);
  });

  it('throws for a missing op, a missing round and an impossible round count', () => {
    const ops = locateAesOps(stateOf(c1()));
    expect(() => opStep(ops, 'mixColumns', 10)).toThrow(/no mixColumns step in round 10/);
    const noOutput = c1();
    stateOf(noOutput).steps = stateOf(noOutput).steps.filter((step) => step.op !== 'output');
    expect(() => locateAesOps(stateOf(noOutput))).toThrow(/no output step/);
    const roundless = c1();
    delete (stateOf(roundless).steps[0] as { round?: number }).round;
    expect(() => locateAesOps(stateOf(roundless))).toThrow(/no integer round/);
    const short = c1();
    stateOf(short).steps = stateOf(short).steps.slice(0, 20);
    expect(() => locateAesOps(stateOf(short))).toThrow(/no final SubBytes/);
  });
});

describe('stateBytesAt / roundKeyBytesAt', () => {
  it('read the plaintext at the input step and the round keys from w after key expansion', () => {
    const facet = stateOf(c1());
    expect(toHex(stateBytesAt(facet, 0))).toBe('00112233445566778899aabbccddeeff');
    expect(toHex(roundKeyBytesAt(facet, 1, 0))).toBe('000102030405060708090a0b0c0d0e0f');
    expect(toHex(roundKeyBytesAt(facet, 1, 10))).toBe('13111d7fe3944a17f307a78b4d2b30c5');
  });

  it('throws when a round key lies outside w', () => {
    expect(() => roundKeyBytesAt(stateOf(c1()), 1, 11)).toThrow(/region "w" has no 16 bytes/);
  });
});

describe('subkeyValueIds / valueIdByRole', () => {
  it('map every round to its subkey value id', () => {
    const ids = subkeyValueIds(valuesOf(c1()));
    expect(ids.size).toBe(11);
    expect([ids.get(0), ids.get(10)]).toEqual(['0/roundKey', '10/roundKey']);
  });

  it('find plaintext and ciphertext ids, undefined for an absent role', () => {
    const values = valuesOf(c1());
    expect([
      valueIdByRole(values, 'plaintext'),
      valueIdByRole(values, 'ciphertext'),
      valueIdByRole(values, 'tag'),
    ]).toEqual(['plaintext', 'ciphertext', undefined]);
  });

  it('throws for a subkey without a round scope', () => {
    const values: ValuesFacet = {
      kind: 'values',
      schemaVersion: 1,
      values: [{ id: 'roundKey', labelKey: 'x', role: 'subkey', bytes: [], createdAt: 0 }],
    };
    expect(() => subkeyValueIds(values)).toThrow(/no round scope/);
  });
});
