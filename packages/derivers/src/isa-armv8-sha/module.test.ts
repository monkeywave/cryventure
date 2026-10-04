import { getFacet, stateAt, toHex, type AnyStateFacet, type I18nRef } from '@cryventure/core';
import { describe, expect, it } from 'vitest';
import {
  indicesOf,
  instructionsNeverCurrent,
  isaFacetProblems,
  isaFacets,
  registerAfter,
  unknownValueRefs,
  writtenBy,
} from '../_lib/fixtures/isaChecks.ts';
import { armVectorRegister } from '../_lib/isaFacets.ts';
import {
  NIST_BY_PRESET,
  NIST_SHA224_ABC,
  NIST_SHA256_ABC,
  SHA256_THREE_BLOCK,
} from '../_lib/sha/fixtures/nistSha256.ts';
import { laneWords as lanes } from '../_lib/sha/fixtures/shaChecks.ts';
import {
  SHA_FIXTURE_PRESETS,
  sharedShaFixtureBundle,
  type ShaFixturePreset,
} from '../_lib/sha/fixtures/shaBundles.ts';
import golden from './fixtures/sha256-abc.golden.json';
import de from './i18n/de.json';
import en from './i18n/en.json';
import { derive } from './module.ts';

const VARIANT = 'aarch64-armv8-sha2';
const LISTING_LENGTH = 132;

const vector = (operand: string): string => armVectorRegister(operand) ?? operand;

describe.each(SHA_FIXTURE_PRESETS)('isa-armv8-sha derive (%s)', (preset) => {
  const bundle = sharedShaFixtureBundle(preset);
  const facets = isaFacets(derive(bundle), VARIANT);
  const instructions = facets.instructions.instructions;
  const nist = NIST_BY_PRESET[preset];

  it('passes the core validators and alignIssues, with known valueRefs', () => {
    expect(isaFacetProblems(facets, bundle)).toEqual([]);
    expect(unknownValueRefs(facets, bundle)).toEqual([]);
  });

  it('repeats the listing once per block', () => {
    expect(instructions).toHaveLength(nist.h.length * LISTING_LENGTH);
    expect(indicesOf(facets, 'sha256h')).toHaveLength(16 * nist.h.length);
    expect(indicesOf(facets, 'sha256h2')).toHaveLength(16 * nist.h.length);
  });

  it('makes every sha256h2 current at some playhead (no zero-width instruction shadows it)', () => {
    const isRound = (instruction: { mnemonic: string }) => instruction.mnemonic === 'sha256h2';
    expect(instructionsNeverCurrent(facets, bundle, isRound)).toEqual([]);
  });

  it('stores H^(n) per block with one stp: the digest words after the last block', () => {
    const stores = indicesOf(facets, 'stp');
    expect(stores).toHaveLength(nist.h.length);
    nist.h.forEach((h, block) => {
      const index = stores[block]!;
      const stored = instructions[index]!.reads.flatMap((source) =>
        lanes(registerAfter(facets, index, source.kind === 'reg' ? source.name : '')),
      );
      expect(stored).toEqual(h);
      expect(instructions[index]!.writes.map((ref) => ref.valueRef)).toEqual([
        `h/${block + 1}`,
        `h/${block + 1}`,
      ]);
    });
    expect(nist.h.at(-1)!.join('').startsWith(nist.digest)).toBe(true);
  });

  it('holds W_s … W_{s+3} in the message register after each sha256su1', () => {
    const state = getFacet<AnyStateFacet>(bundle, 'state')!;
    const lastRound = state.steps.findLastIndex((step) => step.op === 'round');
    const w = stateAt(state, lastRound)['w']!;
    const schedule = (t: number) => toHex(w.slice(4 * t, 4 * t + 4));
    const su1 = indicesOf(facets, 'sha256su1').slice(-12);
    expect(su1).toHaveLength(12);
    su1.forEach((index, group) => {
      const s = 16 + 4 * group;
      const target = vector(instructions[index]!.operands[0]!);
      expect(lanes(writtenBy(facets, index, target)), `W${s}`).toEqual(
        [s, s + 1, s + 2, s + 3].map(schedule),
      );
    });
  });

  it('uses only message keys present in both catalogs', () => {
    const refs: I18nRef[] = [
      facets.instructions.label,
      facets.registers.label,
      ...instructions.flatMap((instruction) => [
        ...(instruction.covers ?? []),
        ...(instruction.note === undefined ? [] : [instruction.note]),
      ]),
    ];
    const missing = refs.map((ref) => ref.key).filter((key) => !(key in en) || !(key in de));
    expect(missing).toEqual([]);
  });

  it('declares only the vector registers the listing uses', () => {
    expect(facets.registers.file.registers.map((spec) => spec.name)).toEqual([
      'v0',
      'v1',
      'v2',
      'v3',
      'v4',
      'v5',
      'v6',
      'v7',
      'v16',
      'v17',
      'v18',
    ]);
  });
});

describe.each([
  ['sha-256-abc', NIST_SHA256_ABC],
  ['sha-224-abc', NIST_SHA224_ABC],
] as const)('isa-armv8-sha against NIST "abc" (%s)', (preset, nist) => {
  const facets = isaFacets(derive(sharedShaFixtureBundle(preset)), VARIANT);
  const instructions = facets.instructions.instructions;

  it.each([0, 12, 60])(
    'holds ABCD after sha256h and EFGH after sha256h2 = a … h after round t+3 (t = %i)',
    (t) => {
      const h = indicesOf(facets, 'sha256h')[t / 4]!;
      const h2 = indicesOf(facets, 'sha256h2')[t / 4]!;
      expect([instructions[h]!.covers, instructions[h2]!.covers]).toEqual([
        [{ key: 'deriver.isa-armv8-sha.covers.rounds', params: { first: t, last: t + 3 } }],
        [{ key: 'deriver.isa-armv8-sha.covers.rounds', params: { first: t, last: t + 3 } }],
      ]);
      const vars = nist.vars[t + 3]!;
      // Lane 0 is the least significant word: ABCD = [A, B, C, D], EFGH = [E, F, G, H] (Arm ARM).
      const abcd = vector(instructions[h]!.operands[0]!);
      const efgh = vector(instructions[h2]!.operands[0]!);
      expect(lanes(registerAfter(facets, h, abcd))).toEqual(vars.slice(0, 4));
      expect(lanes(registerAfter(facets, h2, efgh))).toEqual(vars.slice(4, 8));
    },
  );

  it('computes the NIST schedule words W16 = 61626380 and W63 = 12b1edeb with sha256su1', () => {
    const su1 = indicesOf(facets, 'sha256su1');
    const words = (index: number) =>
      lanes(writtenBy(facets, index, vector(instructions[index]!.operands[0]!)));
    expect(words(su1[0]!)[0]).toBe('61626380');
    expect(words(su1.at(-1)!)[3]).toBe('12b1edeb');
  });
});

describe('isa-armv8-sha on the two-block message', () => {
  const bundle = sharedShaFixtureBundle('sha-256-two-block');
  const instructions = isaFacets(derive(bundle), VARIANT).instructions.instructions;

  it('loads block 2 from H^(1), after block 1 has stored it', () => {
    const loadState = (block: number) =>
      instructions
        .slice(block * LISTING_LENGTH, (block + 1) * LISTING_LENGTH)
        .find(
          (instruction) =>
            instruction.reads[0]?.kind === 'mem' && instruction.reads[0].base === 'x0',
        )!;
    expect(loadState(0).reads.map((ref) => ref.valueRef)).toEqual(['iv', 'iv']);
    expect(loadState(1).reads.map((ref) => ref.valueRef)).toEqual(['h/1', 'h/1']);
    expect(instructions[LISTING_LENGTH]!.align.first).toBeGreaterThan(
      instructions[LISTING_LENGTH - 1]!.align.last,
    );
  });
});

describe('isa-armv8-sha on the 128-byte three-block message', () => {
  const bundle = sharedShaFixtureBundle('sha-256-three-block');
  const facets = isaFacets(derive(bundle), VARIANT);
  const instructions = facets.instructions.instructions;
  const block = (n: number) => instructions.slice(n * LISTING_LENGTH, (n + 1) * LISTING_LENGTH);

  it('derives three blocks with clean alignIssues and spans that never go back', () => {
    expect(isaFacetProblems(facets, bundle)).toEqual([]);
    expect(instructions).toHaveLength(3 * LISTING_LENGTH);
    const firsts = instructions.map((instruction) => instruction.align.first);
    expect(firsts).toEqual([...firsts].sort((a, b) => a - b));
    [1, 2].forEach((n) => {
      expect(block(n)[0]!.align.first).toBeGreaterThan(block(n - 1).at(-1)!.align.last);
    });
  });

  it('loads block n+1 from H^(n) and stores H^(3) = the digest last', () => {
    const loadState = (n: number) =>
      block(n).find(
        (instruction) => instruction.reads[0]?.kind === 'mem' && instruction.reads[0].base === 'x0',
      )!;
    expect([0, 1, 2].map((n) => loadState(n).reads[0]!.valueRef)).toEqual(['iv', 'h/1', 'h/2']);
    const lastStore = indicesOf(facets, 'stp').at(-1)!;
    const stored = instructions[lastStore]!.reads.flatMap((source) =>
      lanes(registerAfter(facets, lastStore, source.kind === 'reg' ? source.name : '')),
    );
    expect(stored.join('')).toBe(SHA256_THREE_BLOCK.digest);
    expect(instructions[lastStore]!.writes.map((ref) => ref.valueRef)).toEqual(['h/3', 'h/3']);
  });
});

describe('isa-armv8-sha golden fixture', () => {
  it('matches derive() for SHA-256 "abc"', () => {
    expect(golden.producerId).toBe('sha256');
    expect(derive(sharedShaFixtureBundle(golden.presetId as ShaFixturePreset))).toEqual(
      golden.facets,
    );
  });
});
