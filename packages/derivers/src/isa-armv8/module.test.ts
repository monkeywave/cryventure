import { toHex } from '@cryventure/core';
import { describe, expect, it } from 'vitest';
import { AES_FIXTURE_PRESETS, aesFixtureBundle } from '../_lib/fixtures/aesBundles.ts';
import { FIPS197_APPENDIX_C } from '../_lib/fixtures/fips197AppC.ts';
import {
  hasCovers,
  instructionsNeverCurrent,
  isaFacetProblems,
  isaFacets,
  registerAfter,
  unknownValueRefs,
} from '../_lib/fixtures/isaChecks.ts';
import golden from './fixtures/aes128-fips-c1.golden.json';
import en from './i18n/en.json';
import de from './i18n/de.json';
import { derive } from './module.ts';

const VARIANT = 'aarch64-armv8-ce';

/** The register an instruction writes (the state moves between v0/v1/v2: register renaming). */
const destination = (writes: readonly { kind: string; name?: string }[]) =>
  writes[0]?.kind === 'reg' ? writes[0].name! : '';

describe.each(AES_FIXTURE_PRESETS)('isa-armv8 derive (%s)', (preset) => {
  const bundle = aesFixtureBundle(preset);
  const facets = isaFacets(derive(bundle), VARIANT);
  const vector = FIPS197_APPENDIX_C[preset];
  const instructions = facets.instructions.instructions;

  it('passes the core validators and alignIssues, with known valueRefs', () => {
    expect(isaFacetProblems(facets, bundle)).toEqual([]);
    expect(unknownValueRefs(facets, bundle)).toEqual([]);
  });

  it('makes every AES-math instruction current at some playhead (no load shadows it)', () => {
    expect(instructionsNeverCurrent(facets, bundle, hasCovers)).toEqual([]);
  });

  it('holds FIPS 197 App. C round[r].m_col after aesmc round r, wherever the state lives', () => {
    const mixes = instructions
      .map((instruction, index) => ({ instruction, index }))
      .filter(({ instruction }) => instruction.mnemonic === 'aesmc');
    expect(mixes).toHaveLength(vector.rounds - 1);
    mixes.forEach(({ instruction, index }, r) =>
      expect(toHex(registerAfter(facets, index, destination(instruction.writes)))).toBe(
        vector.mixColumns[r],
      ),
    );
    expect(
      new Set(mixes.map(({ instruction }) => destination(instruction.writes))).size,
    ).toBeGreaterThan(1);
  });

  it('holds the ciphertext after the final eor', () => {
    const eor = instructions.findIndex((instruction) => instruction.mnemonic === 'eor');
    expect(toHex(registerAfter(facets, eor, destination(instructions[eor]!.writes)))).toBe(
      vector.ciphertext,
    );
    expect(instructions[eor]!.writes[0]!.valueRef).toBe('ciphertext');
  });

  it('puts the fusion note on every aese/aesmc pair, not on the last aese', () => {
    const noted = instructions
      .filter((instruction) => instruction.note !== undefined)
      .map((instruction) => instruction.mnemonic);
    expect(noted).toHaveLength(2 * (vector.rounds - 1));
    expect(
      instructions.findLast((instruction) => instruction.mnemonic === 'aese')!.note,
    ).toBeUndefined();
  });

  it('uses only message keys present in both catalogs', () => {
    const refs = [
      facets.instructions.label,
      facets.registers.label,
      ...instructions.flatMap((instruction) => [
        ...(instruction.covers ?? []),
        ...(instruction.note ? [instruction.note] : []),
      ]),
    ];
    expect(refs.map((ref) => ref.key).filter((key) => !(key in en) || !(key in de))).toEqual([]);
  });
});

describe('isa-armv8 golden fixture', () => {
  it('matches the derived facets of FIPS 197 C.1', () => {
    expect([golden.producerId, golden.presetId]).toEqual(['aes', 'fips197-c1']);
    expect(derive(aesFixtureBundle('fips197-c1'))).toEqual(golden.facets);
  });
});

describe('isa-armv8 spans and keys (docs/M4.md §1e)', () => {
  const facets = isaFacets(derive(aesFixtureBundle('fips197-c1')), VARIANT);
  const instructions = facets.instructions.instructions;

  it('starts with the ldp of keys 0 and 1 at {-1,-1}, then aese 1 = ARK 0 … SR 1 and aesmc 1 = MC 1', () => {
    expect(
      instructions
        .slice(0, 4)
        .map((instruction) => [
          instruction.mnemonic,
          instruction.align.first,
          instruction.align.last,
        ]),
    ).toEqual([
      ['ldp', -1, -1],
      ['ldr', 0, 0],
      ['aese', 2, 4],
      ['aesmc', 5, 5],
    ]);
  });

  it('loads two round keys per ldp with consecutive offsets and subkey refs', () => {
    expect(instructions[0]!.reads).toEqual([
      { kind: 'mem', base: 'x2', offset: 0, size: 16, valueRef: '0/roundKey' },
      { kind: 'mem', base: 'x2', offset: 16, size: 16, valueRef: '1/roundKey' },
    ]);
    expect(
      facets.registers.steps[0]!.writes.map((write) => [
        write.reg,
        toHex(write.bytes),
        write.valueRef,
      ]),
    ).toEqual([
      ['v1', '000102030405060708090a0b0c0d0e0f', '0/roundKey'],
      ['v2', 'd6aa74fdd2af72fadaa678f1d6ab76fe', '1/roundKey'],
    ]);
  });
});
