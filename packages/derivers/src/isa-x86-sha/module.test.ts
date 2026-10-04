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

const VARIANT = 'x86_64-sha-ni';
const LISTING_LENGTH = 167;

const pick = (words: readonly string[], names: string): string[] =>
  [...names].map((name) => words['abcdefgh'.indexOf(name)]!);

describe.each(SHA_FIXTURE_PRESETS)('isa-x86-sha derive (%s)', (preset) => {
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
    expect(indicesOf(facets, 'sha256rnds2')).toHaveLength(32 * nist.h.length);
  });

  it('makes every sha256rnds2 current at some playhead (no zero-width instruction shadows it)', () => {
    const isRound = (instruction: { mnemonic: string }) => instruction.mnemonic === 'sha256rnds2';
    expect(instructionsNeverCurrent(facets, bundle, isRound)).toEqual([]);
  });

  it('stores H^(n) per block: the digest words after the last block', () => {
    const stores = instructions.flatMap((instruction, index) =>
      instruction.mnemonic === 'movdqu' && instruction.writes[0]?.kind === 'mem' ? [index] : [],
    );
    expect(stores).toHaveLength(2 * nist.h.length);
    nist.h.forEach((h, block) => {
      const stored = stores.slice(2 * block, 2 * block + 2).flatMap((index) => {
        const source = instructions[index]!.reads[0]!;
        return lanes(registerAfter(facets, index, source.kind === 'reg' ? source.name : ''));
      });
      expect(stored).toEqual(h);
      expect(instructions[stores[2 * block]!]!.writes[0]!.valueRef).toBe(`h/${block + 1}`);
    });
    expect(nist.h.at(-1)!.join('').startsWith(nist.digest)).toBe(true);
  });

  it('holds W_s … W_{s+3} in the message register after each sha256msg2', () => {
    const state = getFacet<AnyStateFacet>(bundle, 'state')!;
    const lastRound = state.steps.findLastIndex((step) => step.op === 'round');
    const w = stateAt(state, lastRound)['w']!;
    const schedule = (t: number) => toHex(w.slice(4 * t, 4 * t + 4));
    const msg2 = indicesOf(facets, 'sha256msg2').slice(-12);
    expect(msg2).toHaveLength(12);
    msg2.forEach((index, group) => {
      const s = 16 + 4 * group;
      const target = instructions[index]!.operands[0]!;
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

  it('declares only the xmm registers the listing uses', () => {
    expect(facets.registers.file.registers.map((spec) => spec.name)).toEqual([
      'xmm0',
      'xmm1',
      'xmm2',
      'xmm3',
      'xmm4',
      'xmm5',
      'xmm6',
      'xmm7',
      'xmm8',
      'xmm9',
    ]);
  });
});

describe.each([
  ['sha-256-abc', NIST_SHA256_ABC],
  ['sha-224-abc', NIST_SHA224_ABC],
] as const)('isa-x86-sha against NIST "abc" (%s)', (preset, nist) => {
  const facets = isaFacets(derive(sharedShaFixtureBundle(preset)), VARIANT);
  const instructions = facets.instructions.instructions;

  it.each([0, 14, 62])(
    'holds ABEF / CDGH = a … h after round t+1 once sha256rnds2 runs rounds t, t+1 (t = %i)',
    (t) => {
      const index = indicesOf(facets, 'sha256rnds2')[t / 2]!;
      const [abef, cdgh] = instructions[index]!.operands as [string, string];
      expect(instructions[index]!.covers).toEqual([
        { key: 'deriver.isa-x86-sha.covers.rounds', params: { first: t, last: t + 1 } },
      ]);
      const vars = nist.vars[t + 1]!;
      // Lane 0 is the least significant dword: ABEF = [F, E, B, A], CDGH = [H, G, D, C] (Intel SDM).
      expect(lanes(registerAfter(facets, index, abef))).toEqual(pick(vars, 'feba'));
      expect(lanes(registerAfter(facets, index, cdgh))).toEqual(pick(vars, 'hgdc'));
    },
  );
  it('computes the NIST schedule words W16 = 61626380 and W63 = 12b1edeb with sha256msg2', () => {
    const msg2 = indicesOf(facets, 'sha256msg2');
    const words = (index: number) =>
      lanes(writtenBy(facets, index, instructions[index]!.operands[0]!));
    expect(words(msg2[0]!)[0]).toBe('61626380');
    expect(words(msg2.at(-1)!)[3]).toBe('12b1edeb');
  });
});

describe('isa-x86-sha on the two-block message', () => {
  const bundle = sharedShaFixtureBundle('sha-256-two-block');
  const instructions = isaFacets(derive(bundle), VARIANT).instructions.instructions;

  it('loads block 2 from H^(1), after block 1 has stored it', () => {
    const second = instructions[LISTING_LENGTH]!;
    expect(second.reads[0]).toMatchObject({ kind: 'mem', base: 'rdi', valueRef: 'h/1' });
    expect(second.align.first).toBeGreaterThan(instructions[LISTING_LENGTH - 1]!.align.last);
    expect(instructions[0]!.reads[0]).toMatchObject({ valueRef: 'iv' });
  });
});

describe('isa-x86-sha on the 128-byte three-block message', () => {
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
    expect([0, 1, 2].map((n) => block(n)[0]!.reads[0]!.valueRef)).toEqual(['iv', 'h/1', 'h/2']);
    const lastStores = instructions
      .flatMap((instruction, index) =>
        instruction.mnemonic === 'movdqu' && instruction.writes[0]?.kind === 'mem' ? [index] : [],
      )
      .slice(-2);
    const stored = lastStores.flatMap((index) => {
      const source = instructions[index]!.reads[0]!;
      return lanes(registerAfter(facets, index, source.kind === 'reg' ? source.name : ''));
    });
    expect(stored.join('')).toBe(SHA256_THREE_BLOCK.digest);
    expect(instructions[lastStores[0]!]!.writes[0]!.valueRef).toBe('h/3');
  });
});

describe('isa-x86-sha golden fixture', () => {
  it('matches derive() for SHA-256 "abc"', () => {
    expect(golden.producerId).toBe('sha256');
    expect(derive(sharedShaFixtureBundle(golden.presetId as ShaFixturePreset))).toEqual(
      golden.facets,
    );
  });
});
