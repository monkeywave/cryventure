import { describe, expect, it } from 'vitest';
import type { ShaListingInstruction } from '../_lib/listing.ts';
import { listedSha, shaMachine } from '../_lib/sha/fixtures/shaChecks.ts';
import { shaExecute } from '../_lib/sha/shaDerivation.ts';
import { varLanes, word, type Lanes } from '../_lib/sha/shaWords.ts';
import { ARMV8_SHA512_PROFILE, armSha512Note } from './sha512Profile.ts';

const SHA512 = { wordBytes: 8, rounds: 80 };
const listing = ARMV8_SHA512_PROFILE.listing.instructions;

const run = (
  instruction: ShaListingInstruction,
  contents: Record<string, Lanes> = {},
  position: { listing?: readonly ShaListingInstruction[]; index?: number } = {},
) =>
  shaExecute(
    ARMV8_SHA512_PROFILE,
    instruction,
    shaMachine(contents, undefined, { ...SHA512, ...position }),
  );
const lanesOf = (effects: ReturnType<typeof run>) => effects.written[0]!.lanes;

describe('ARMv8.2 SHA512 semantics on 64-bit lane words', () => {
  it('loads two words per register: (c, d), (e, f) with ldp, (g, h) with ldr, from the chaining value', () => {
    const pair = run(listedSha('ldp', ['q1', 'q2', '[x0, #16]'], 'loadState'));
    expect(pair.written).toEqual([
      { reg: 'v1', lanes: varLanes(['c', 'd'], -1) },
      { reg: 'v2', lanes: varLanes(['e', 'f'], -1) },
    ]);
    const one = run(listedSha('ldr', ['q0', '[x0, #48]'], 'loadState'));
    expect(lanesOf(one)).toEqual(varLanes(['g', 'h'], -1));
    expect(one.reads).toEqual([{ kind: 'mem', base: 'x0', offset: 48, size: 16, valueRef: 'iv' }]);
    const block = run(listedSha('ldp', ['q6', 'q16', '[x1, #32]'], 'loadBlock'));
    expect(block.written[1]).toEqual({ reg: 'v16', lanes: [word.wBytes(6), word.wBytes(7)] });
  });

  it('loads the n-th literal pair as K_2n, K_2n+1 (checked when it meets W)', () => {
    const third = listing.findIndex((i) => i.operands[1]?.includes('.LCPI0_2]') === true);
    const effects = run(listing[third]!, {}, { listing, index: third });
    expect([lanesOf(effects), effects.reads]).toEqual([[word.k(4), word.k(5)], []]);
    const add = listedSha('add', ['v0.2d', 'v3.2d', 'v0.2d'], 'addK');
    expect(lanesOf(run(add, { v3: [word.w(4), word.w(5)], v0: [word.k(4), word.k(5)] }))).toEqual([
      word.kw(4),
      word.kw(5),
    ]);
    expect(() => run(add, { v3: [word.w(6), word.w(7)], v0: [word.k(4), word.k(5)] })).toThrow(
      /no traced value for the sum in lane 0/,
    );
  });

  it('swaps or pairs halves with ext and rejects a shift that splits a word', () => {
    const swap = listedSha('ext', ['v5.16b', 'v0.16b', 'v0.16b', '#8'], 'addK');
    const swapped = run(swap, { v0: [word.kw(0), word.kw(1)] });
    expect(lanesOf(swapped)).toEqual([word.kw(1), word.kw(0)]);
    expect(swapped.reads).toEqual([{ kind: 'reg', name: 'v0' }]);
    const pair = listedSha('ext', ['v7.16b', 'v1.16b', 'v2.16b', '#8'], 'packState');
    const de = run(pair, { v1: varLanes(['c', 'd'], -1), v2: varLanes(['e', 'f'], -1) });
    expect(lanesOf(de)).toEqual(varLanes(['d', 'e'], -1));
    expect(() =>
      run(listedSha('ext', ['v7.16b', 'v1.16b', 'v2.16b', '#4'], 'packState'), {
        v1: varLanes(['c', 'd'], -1),
        v2: varLanes(['e', 'f'], -1),
      }),
    ).toThrow(/splits a word/);
  });

  it('adds h to the swapped K+W (hKW) and d to T1 (the new e pair)', () => {
    const hkw = listedSha('add', ['v17.2d', 'v5.2d', 'v0.2d'], 'addK');
    const kw = { v5: [word.kw(1), word.kw(0)], v0: varLanes(['g', 'h'], -1) };
    expect(lanesOf(run(hkw, kw))).toEqual([word.hKW(1), word.hKW(0)]);
    const newE = listedSha('add', ['v7.2d', 'v17.2d', 'v1.2d'], 'rounds', { round: 0 });
    const t1 = { v17: [word.T1(1), word.T1(0)], v1: varLanes(['c', 'd'], -1) };
    expect(lanesOf(run(newE, t1))).toEqual([word.var('e', 1), word.var('e', 0)]);
  });

  it('runs sha512h and sha512h2 for rounds t, t+1, checking every operand', () => {
    const sha512h = listedSha('sha512h', ['q17', 'q6', 'v7.2d'], 'rounds', { round: 2 });
    const before = {
      v17: [word.hKW(3), word.hKW(2)],
      v6: varLanes(['f', 'g'], 1),
      v7: varLanes(['d', 'e'], 1),
    };
    expect(lanesOf(run(sha512h, before))).toEqual([word.T1(3), word.T1(2)]);
    expect(() => run(sha512h, { ...before, v7: varLanes(['d', 'e'], 0) })).toThrow(
      /v7 must hold \(d, e\) before round 2/,
    );
    expect(() => run(sha512h, { ...before, v17: [word.hKW(2), word.hKW(3)] })).toThrow(
      /h\+K\+W of rounds 2, 3/,
    );
    const sha512h2 = listedSha('sha512h2', ['q17', 'q1', 'v4.2d'], 'rounds2', { round: 2 });
    const half = {
      v17: [word.T1(3), word.T1(2)],
      v1: varLanes(['c', 'd'], 1),
      v4: varLanes(['a', 'b'], 1),
    };
    expect(lanesOf(run(sha512h2, half))).toEqual(varLanes(['a', 'b'], 3));
    expect(() => run(sha512h2, { ...half, v1: varLanes(['a', 'b'], 1) })).toThrow(
      /v1 must hold \(c, d\) before round 2/,
    );
  });

  it('runs sha512su0 and sha512su1 on two schedule words', () => {
    const su0 = listedSha('sha512su0', ['v3.2d', 'v5.2d'], 'msg1', { w: 16 });
    expect(lanesOf(run(su0, { v3: [word.w(0), word.w(1)], v5: [word.w(2), word.w(3)] }))).toEqual([
      word.p1(16),
      word.p1(17),
    ]);
    expect(() => run(su0, { v3: [word.w(0), word.w(1)], v5: [word.w(3)] })).toThrow(/W2 in lane 0/);
    const su1 = listedSha('sha512su1', ['v3.2d', 'v19.2d', 'v24.2d'], 'msg2', { w: 16 });
    const window = {
      v3: [word.p1(16), word.p1(17)],
      v19: [word.w(14), word.w(15)],
      v24: [word.w(9), word.w(10)],
    };
    expect(lanesOf(run(su1, window))).toEqual([word.w(16), word.w(17)]);
    expect(() => run(su1, { ...window, v24: [word.w(10), word.w(11)] })).toThrow(/W9, W10/);
  });

  it('keeps the folded feed-forward partial until T1 completes H (e, f)', () => {
    const first = listedSha('add', ['v2.2d', 'v6.2d', 'v2.2d'], 'feedForward');
    const partial = lanesOf(
      run(first, { v6: varLanes(['c', 'd'], 77), v2: varLanes(['e', 'f'], -1) }),
    );
    expect(partial.every((lane) => lane.kind === 'partial')).toBe(true);
    const second = listedSha('add', ['v2.2d', 'v2.2d', 'v7.2d'], 'feedForward');
    expect(lanesOf(run(second, { v2: partial, v7: [word.T1(79), word.T1(78)] }))).toEqual([
      word.h('e'),
      word.h('f'),
    ]);
    const plain = listedSha('add', ['v4.2d', 'v5.2d', 'v4.2d'], 'feedForward');
    expect(
      lanesOf(run(plain, { v5: varLanes(['a', 'b'], 79), v4: varLanes(['a', 'b'], -1) })),
    ).toEqual([word.h('a'), word.h('b')]);
  });
});

describe('ARMv8.2 SHA512 notes', () => {
  const note = (index: number) => armSha512Note(listing, index)?.key.replace(/^.*\.note\./, '');
  const indexOf = (predicate: (instruction: ShaListingInstruction) => boolean) =>
    listing.findIndex(predicate);
  const keysOf = (predicate: (instruction: ShaListingInstruction) => boolean) => [
    ...new Set(
      listing.flatMap((instruction, index) => (predicate(instruction) ? [note(index)] : [])),
    ),
  ];

  it('explain both halves of a two-round step, the new e and the K+W chain', () => {
    expect(keysOf((i) => i.mnemonic === 'sha512h')).toEqual(['sha512h']);
    expect(keysOf((i) => i.mnemonic === 'sha512h2')).toEqual(['sha512h2']);
    expect(keysOf((i) => i.mnemonic === 'add' && i.role === 'rounds')).toEqual(['newE']);
    expect(keysOf((i) => i.mnemonic === 'add' && i.role === 'addK').sort()).toEqual([
      'addHkw',
      'addKw512',
    ]);
    expect(keysOf((i) => i.mnemonic === 'ext' && i.role === 'addK')).toEqual(['swapKw']);
    expect(keysOf((i) => i.mnemonic === 'ext' && i.role === 'packState')).toEqual(['pairState']);
    expect(keysOf((i) => i.mnemonic === 'ext' && i.role === 'msg2')).toEqual(['pairSchedule']);
  });

  it('mark the one partial feed-forward and the T1 copy', () => {
    const feedForward = listing.flatMap((instruction, index) =>
      instruction.role === 'feedForward' ? [note(index)] : [],
    );
    expect(feedForward.filter((key) => key === 'partialFeedForward')).toHaveLength(1);
    expect(feedForward.filter((key) => key === 'feedForward512')).toHaveLength(4);
    expect(note(indexOf((i) => i.mnemonic === 'mov'))).toBe('copyT1');
  });

  it('name the round constants of each literal load and the schedule words ahead', () => {
    const last = indexOf((i) => i.operands[1]?.includes('.LCPI0_39]') === true);
    expect(armSha512Note(listing, last)).toEqual({
      key: 'deriver.isa-armv8-sha.note.literalK',
      params: { first: 78, last: 79 },
    });
    expect(
      armSha512Note(
        listing,
        indexOf((i) => i.mnemonic === 'sha512su0'),
      ),
    ).toEqual({
      key: 'deriver.isa-armv8-sha.note.scheduleAhead512',
      params: { first: 16, last: 17 },
    });
    expect(note(indexOf((i) => i.mnemonic === 'adrp'))).toBeUndefined();
    expect(note(0)).toBeUndefined();
  });
});
