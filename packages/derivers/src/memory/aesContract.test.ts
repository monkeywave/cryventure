import { getFacet, type StateFacet, type TraceBundle, type ValuesFacet } from '@cryventure/core';
import { describe, expect, it } from 'vitest';
import { readAesRun } from './aesContract.ts';
import { AES_BUNDLES, aes128Bundle } from './testBundles.ts';

type AnyState = StateFacet<string, { op: string }>;
const stateOf = (bundle: TraceBundle) => getFacet<AnyState>(bundle, 'state')!;
const valuesOf = (bundle: TraceBundle) => getFacet<ValuesFacet>(bundle, 'values')!;

describe('readAesRun', () => {
  it.each(AES_BUNDLES)('$presetId: reads steps, rounds and the 16-byte round keys', ({ bundle, rounds }) => {
    const run = readAesRun(bundle);
    expect(run.rounds).toBe(rounds);
    expect(run.roundKeys).toHaveLength(rounds + 1);
    expect(run.steps).toEqual({ input: 0, keyExpansion: 1, output: run.stepCount - 1 });
    expect(run.roundKeys[0]!.valueId).toBe('0/roundKey');
    expect(run.valueIds).toEqual({ key: 'key', plaintext: 'plaintext', ciphertext: 'ciphertext' });
    expect(run.ciphertext).toEqual(bundle.output['ciphertext']);
  });

  it('reads the FIPS 197 C.1 plaintext and round key 0', () => {
    const run = readAesRun(aes128Bundle());
    expect(run.plaintext).toEqual([0x00, 0x11, 0x22, 0x33, 0x44, 0x55, 0x66, 0x77, 0x88, 0x99, 0xaa, 0xbb, 0xcc, 0xdd, 0xee, 0xff]);
    expect(run.roundKeys[0]!.bytes).toEqual(Array.from({ length: 16 }, (_, index) => index));
  });

  it('maps subkeys to rounds by their id scope, like the ISA derivers (one rule in _lib/aesTrace)', () => {
    const bundle = aes128Bundle();
    valuesOf(bundle).values.reverse();
    const run = readAesRun(bundle);
    expect(run.roundKeys.map(({ valueId }) => valueId)).toEqual(
      Array.from({ length: 11 }, (_, round) => `${round}/roundKey`),
    );
    expect(run.valueIds.plaintext).toBe('plaintext');
  });

  it('leaves value ids undefined when the values facet lacks them', () => {
    const bundle = aes128Bundle();
    const values = valuesOf(bundle);
    values.values = values.values.filter((value) => value.role === 'subkey');
    expect(readAesRun(bundle).valueIds).toEqual({ key: undefined, plaintext: undefined, ciphertext: undefined });
  });

  it('throws without a state or values facet', () => {
    const bundle = aes128Bundle();
    delete bundle.facets['values@default'];
    expect(() => readAesRun(bundle)).toThrow(/AES trace contract: no values facet/);
  });

  it('throws when an op is renamed', () => {
    const bundle = aes128Bundle();
    stateOf(bundle).steps[1]!.op = 'expandKey';
    expect(() => readAesRun(bundle)).toThrow(/no keyExpansion step in round 0/);
  });

  it('throws when a round key has no subkey value', () => {
    const bundle = aes128Bundle();
    const values = valuesOf(bundle);
    values.values = values.values.filter((value) => value.id !== '10/roundKey');
    expect(() => readAesRun(bundle)).toThrow(/no subkey value for round key 10/);
  });

  it('throws for a subkey that is not 16 bytes', () => {
    const bundle = aes128Bundle();
    valuesOf(bundle).values.find((value) => value.role === 'subkey')!.bytes.pop();
    expect(() => readAesRun(bundle)).toThrow(/does not match the subkey values \(0\/roundKey\)/);
  });

  it('throws when the schedule in w disagrees with the subkeys', () => {
    const bundle = aes128Bundle();
    valuesOf(bundle).values.find((value) => value.id === '3/roundKey')!.bytes[0]! ^= 1;
    expect(() => readAesRun(bundle)).toThrow(/does not match the subkey values/);
  });
});
