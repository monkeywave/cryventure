import {
  getFacet,
  registersAt,
  stateAt,
  toHex,
  type AnyStateFacet,
  type I18nRef,
} from '@cryventure/core';
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
import { NIST_SHA512_ABC, NIST_SHA512_BY_PRESET } from '../_lib/sha/fixtures/nistSha512.ts';
import {
  SHA512_FIXTURE_PRESETS,
  sharedShaFixtureBundle,
  type Sha512FixturePreset,
} from '../_lib/sha/fixtures/shaBundles.ts';
import { laneWords } from '../_lib/sha/fixtures/shaChecks.ts';
import golden from './fixtures/sha512-abc.golden.json';
import de from './i18n/de.json';
import en from './i18n/en.json';
import { derive } from './module.ts';

const VARIANT = 'aarch64-armv8-sha512';
const LISTING_LENGTH = 519;

const vector = (operand: string): string => armVectorRegister(operand) ?? operand;
/** The two 64-bit lanes (lane 0 first) of register bytes, as big-endian hex words. */
const lanes = (bytes: readonly number[]): string[] => laneWords(bytes, 8);

const derived = (preset: Sha512FixturePreset) => {
  const bundle = sharedShaFixtureBundle(preset);
  return { bundle, facets: isaFacets(derive(bundle), VARIANT) };
};

describe.each(SHA512_FIXTURE_PRESETS)('isa-armv8-sha SHA-512 derive (%s)', (preset) => {
  const { bundle, facets } = derived(preset);
  const instructions = facets.instructions.instructions;
  const nist = NIST_SHA512_BY_PRESET[preset];

  it('passes the core validators and alignIssues, with known valueRefs', () => {
    expect(isaFacetProblems(facets, bundle)).toEqual([]);
    expect(unknownValueRefs(facets, bundle)).toEqual([]);
  });

  it('repeats the 519-instruction listing once per block, 40 sha512h/sha512h2 each', () => {
    expect(instructions).toHaveLength(nist.h.length * LISTING_LENGTH);
    expect(indicesOf(facets, 'sha512h')).toHaveLength(40 * nist.h.length);
    expect(indicesOf(facets, 'sha512h2')).toHaveLength(40 * nist.h.length);
    expect(indicesOf(facets, 'sha512su1')).toHaveLength(32 * nist.h.length);
  });

  it('keeps spans that never go back, and every sha512h2 current at some playhead', () => {
    const firsts = instructions.map((instruction) => instruction.align.first);
    const lasts = instructions.map((instruction) => instruction.align.last);
    expect(firsts).toEqual([...firsts].sort((a, b) => a - b));
    expect(lasts).toEqual([...lasts].sort((a, b) => a - b));
    const isRound = (instruction: { mnemonic: string }) => instruction.mnemonic === 'sha512h2';
    expect(instructionsNeverCurrent(facets, bundle, isRound)).toEqual([]);
  });

  it('stores H^(n) per block with two stp: the digest words after the last block', () => {
    const stores = indicesOf(facets, 'stp');
    expect(stores).toHaveLength(2 * nist.h.length);
    nist.h.forEach((h, block) => {
      const words = new Map<number, string>();
      stores.slice(2 * block, 2 * block + 2).forEach((index) => {
        const instruction = instructions[index]!;
        instruction.reads.forEach((source, position) => {
          const target = instruction.writes[position]!;
          const offset = target.kind === 'mem' ? target.offset : -1;
          const bytes = registerAfter(facets, index, source.kind === 'reg' ? source.name : '');
          lanes(bytes).forEach((value, lane) => words.set(offset / 8 + lane, value));
        });
        expect(instruction.writes.map((ref) => ref.valueRef)).toEqual([
          `h/${block + 1}`,
          `h/${block + 1}`,
        ]);
      });
      expect([...words.keys()].sort((a, b) => a - b).map((key) => words.get(key))).toEqual(h);
    });
    expect(nist.h.at(-1)!.join('')).toBe(nist.digest);
  });

  it('holds W_s, W_{s+1} in the message register after each sha512su1', () => {
    const state = getFacet<AnyStateFacet>(bundle, 'state')!;
    const lastRound = state.steps.findLastIndex((step) => step.op === 'round');
    const w = stateAt(state, lastRound)['w']!;
    const schedule = (t: number) => toHex(w.slice(8 * t, 8 * t + 8));
    const su1 = indicesOf(facets, 'sha512su1').slice(-32);
    su1.forEach((index, pair) => {
      const s = 16 + 2 * pair;
      const target = vector(instructions[index]!.operands[0]!);
      expect(lanes(writtenBy(facets, index, target)), `W${s}`).toEqual([s, s + 1].map(schedule));
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
    expect(facets.instructions.label.key).toBe('deriver.isa-armv8-sha.sha512.label');
  });

  it('declares only the vector registers the listing uses (no spills: v0–v7, v16–v28)', () => {
    const numbers = [0, 1, 2, 3, 4, 5, 6, 7, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28];
    expect(facets.registers.file.registers).toEqual(
      numbers.map((n) => ({ name: `v${n}`, bits: 128, lanes: [8, 16, 32, 64] })),
    );
  });
});

describe('isa-armv8-sha against NIST SHA-512 "abc"', () => {
  const { facets } = derived('sha-512-abc');
  const instructions = facets.instructions.instructions;
  const h2 = indicesOf(facets, 'sha512h2');
  /** Which registers hold (x, y) of `vars` (lane 0 = x) at the playhead. */
  const holders = (contents: Map<string, number[] | undefined>, pair: readonly string[]) =>
    [...contents].flatMap(([name, bytes]) =>
      bytes !== undefined && lanes(bytes).join() === pair.join() ? [name] : [],
    );

  it.each([0, 38])(
    'holds (a, b) … (g, h) after the sha512h2 of rounds t, t+1 = NIST a … h after round t+1 (t = %i)',
    (t) => {
      const index = h2[t / 2]!;
      expect(instructions[index]!.covers).toEqual([
        { key: 'deriver.isa-armv8-sha.covers.rounds', params: { first: t, last: t + 1 } },
      ]);
      const vars = NIST_SHA512_ABC.vars[t + 1]!;
      const contents = registersAt(facets.registers, instructions[index]!.align.last);
      const ab = vector(instructions[index]!.operands[0]!);
      expect(contents.get(ab) && lanes(contents.get(ab)!)).toEqual(vars.slice(0, 2));
      [2, 4, 6].forEach((first) =>
        expect(holders(contents, vars.slice(first, first + 2)), `pair ${first}`).not.toEqual([]),
      );
    },
  );

  it('holds (a, b), (c, d), (g, h) after round 79; (e, f) is folded into the feed-forward', () => {
    const index = h2[39]!;
    const vars = NIST_SHA512_ABC.vars[79]!;
    const contents = registersAt(facets.registers, instructions[index]!.align.last);
    expect(lanes(contents.get(vector(instructions[index]!.operands[0]!))!)).toEqual(
      vars.slice(0, 2),
    );
    expect(holders(contents, vars.slice(2, 4))).not.toEqual([]);
    expect(holders(contents, vars.slice(6, 8))).not.toEqual([]);
    expect(holders(contents, vars.slice(4, 6))).toEqual([]);
  });

  it('notes the untraced partial feed-forward and writes no register bytes for it', () => {
    const partial = instructions.findIndex(
      (instruction) => instruction.note?.key === 'deriver.isa-armv8-sha.note.partialFeedForward',
    );
    expect(instructions[partial]).toMatchObject({
      mnemonic: 'add',
      operands: ['v2.2d', 'v6.2d', 'v2.2d'],
    });
    expect(writtenBy(facets, partial, 'v2')).toEqual([]);
  });

  it('chips the first sha512su1 with W16, W17 and the first sha512h with rounds 0, 1', () => {
    const su1 = indicesOf(facets, 'sha512su1');
    expect(instructions[indicesOf(facets, 'sha512h')[0]!]!.covers).toEqual([
      { key: 'deriver.isa-armv8-sha.covers.rounds', params: { first: 0, last: 1 } },
    ]);
    expect(instructions[su1[0]!]!.covers).toEqual([
      { key: 'deriver.isa-armv8-sha.covers.msg2', params: { first: 16, last: 17 } },
    ]);
  });
});

describe('isa-armv8-sha on the SHA-512 two-block message', () => {
  const { facets } = derived('sha-512-two-block');
  const instructions = facets.instructions.instructions;

  it('loads block 2 from H^(1), after block 1 has stored it', () => {
    const stateLoads = (block: number) =>
      instructions
        .slice(block * LISTING_LENGTH, (block + 1) * LISTING_LENGTH)
        .flatMap((instruction) =>
          instruction.reads.filter((ref) => ref.kind === 'mem' && ref.base === 'x0'),
        )
        .map((ref) => ref.valueRef);
    expect(stateLoads(0)).toEqual(['iv', 'iv', 'iv', 'iv']);
    expect(stateLoads(1)).toEqual(['h/1', 'h/1', 'h/1', 'h/1']);
    expect(instructions[LISTING_LENGTH]!.align.first).toBeGreaterThan(
      instructions[LISTING_LENGTH - 1]!.align.last,
    );
  });
});

describe('isa-armv8-sha SHA-512 golden fixture', () => {
  it('matches derive() for SHA-512 "abc"', () => {
    expect(golden.producerId).toBe('sha512');
    expect(derive(sharedShaFixtureBundle(golden.presetId as Sha512FixturePreset))).toEqual(
      golden.facets,
    );
  });
});
