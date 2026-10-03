import { toHex } from '@cryventure/core';
import { describe, expect, it } from 'vitest';
import { AES_FIXTURE_PRESETS, aesFixtureBundle } from '../_lib/fixtures/aesBundles.ts';
import { FIPS197_APPENDIX_C } from '../_lib/fixtures/fips197AppC.ts';
import {
  aesInstructionsNeverCurrent,
  isaFacetProblems,
  isaFacets,
  registerAfter,
  unknownValueRefs,
} from '../_lib/fixtures/isaChecks.ts';
import golden from './fixtures/aes128-fips-c1.golden.json';
import en from './i18n/en.json';
import de from './i18n/de.json';
import { derive } from './module.ts';

const VARIANT = 'x86_64-aesni';

describe.each(AES_FIXTURE_PRESETS)('isa-x86 derive (%s)', (preset) => {
  const bundle = aesFixtureBundle(preset);
  const facets = isaFacets(derive(bundle), VARIANT);
  const vector = FIPS197_APPENDIX_C[preset];
  const instructions = facets.instructions.instructions;

  it('passes the core validators and alignIssues, with known valueRefs', () => {
    expect(isaFacetProblems(facets, bundle)).toEqual([]);
    expect(unknownValueRefs(facets, bundle)).toEqual([]);
  });

  it('makes every AES-math instruction current at some playhead (no load shadows it)', () => {
    expect(aesInstructionsNeverCurrent(facets, bundle)).toEqual([]);
  });

  it('picks the listing by Nr', () => {
    expect(facets.instructions.source.function).toBe(
      `aes_encrypt_block_${{ 10: 128, 12: 192, 14: 256 }[vector.rounds]}`,
    );
  });

  it('holds FIPS 197 App. C round[r+1].start in xmm0 after aesenc round r', () => {
    const rounds = instructions
      .map((instruction, index) => ({ instruction, index }))
      .filter(({ instruction }) => instruction.mnemonic === 'aesenc');
    expect(rounds).toHaveLength(vector.rounds - 1);
    rounds.forEach(({ index }, r) =>
      expect(toHex(registerAfter(facets, index, 'xmm0'))).toBe(vector.start[r + 1]),
    );
  });

  it('holds round[1].start after pxor and the ciphertext after aesenclast', () => {
    const pxor = instructions.findIndex((instruction) => instruction.mnemonic === 'pxor');
    const last = instructions.findIndex((instruction) => instruction.mnemonic === 'aesenclast');
    expect(toHex(registerAfter(facets, pxor, 'xmm0'))).toBe(vector.start[0]);
    expect(toHex(registerAfter(facets, last, 'xmm0'))).toBe(vector.ciphertext);
    expect(instructions[last]!.writes[0]!.valueRef).toBe('ciphertext');
  });

  it('uses only message keys present in both catalogs', () => {
    const keys = [
      facets.instructions.label,
      facets.registers.label,
      ...instructions.flatMap((instruction) => instruction.covers ?? []),
    ].map((ref) => ref.key);
    expect(keys.filter((key) => !(key in en) || !(key in de))).toEqual([]);
  });
});

describe('isa-x86 golden fixture', () => {
  it('matches the derived facets of FIPS 197 C.1', () => {
    expect(golden.producerId).toBe('aes');
    expect(golden.presetId).toBe('fips197-c1');
    expect(derive(aesFixtureBundle('fips197-c1'))).toEqual(golden.facets);
  });
});

describe('isa-x86 spans (docs/M4.md §1e)', () => {
  it("aligns aesenc round 1 to SB 1 … ARK 1 and key loads to the next AES instruction's first step", () => {
    const instructions = isaFacets(derive(aesFixtureBundle('fips197-c1')), VARIANT).instructions
      .instructions;
    expect(
      instructions
        .map((instruction) => [
          instruction.mnemonic,
          instruction.align.first,
          instruction.align.last,
        ])
        .slice(0, 5),
    ).toEqual([
      ['movdqu', 0, 0],
      ['movdqu', 2, 2],
      ['pxor', 2, 2],
      ['movdqu', 3, 3],
      ['aesenc', 3, 6],
    ]);
    expect(instructions.at(-2)!.align).toEqual({ first: 42, last: 42 });
  });
});
