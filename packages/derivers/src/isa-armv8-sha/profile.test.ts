import { describe, expect, it } from 'vitest';
import type { ShaListingInstruction } from '../_lib/listing.ts';
import { deriveShaIsaFacets, shaExecute, type ShaIsaProfile } from '../_lib/sha/shaDerivation.ts';
import { sharedShaFixtureBundle } from '../_lib/sha/fixtures/shaBundles.ts';
import { listedSha, shaMachine } from '../_lib/sha/fixtures/shaChecks.ts';
import { laneRun, varLanes, word, type Lanes } from '../_lib/sha/shaWords.ts';
import { ARMV8_SHA_PROFILE, armShaNote } from './profile.ts';

const ABCD = ['a', 'b', 'c', 'd'] as const;
const EFGH = ['e', 'f', 'g', 'h'] as const;
const H = (names: readonly (typeof ABCD)[number][] | readonly (typeof EFGH)[number][]) =>
  names.map((name) => word.h(name));

const run = (instruction: ShaListingInstruction, contents: Record<string, Lanes> = {}) =>
  shaExecute(ARMV8_SHA_PROFILE, instruction, shaMachine(contents));
const lanesOf = (effects: ReturnType<typeof run>, index = 0) => effects.written[index]!.lanes;

/** `ldr q4, <label>` → `add v5 = W + K` → `sha256h … v5` running rounds `round` … `round + 3`. */
const literalChain = (label: string, round: number): ShaListingInstruction[] => [
  listedSha('ldr', ['q4', `[x8, :lo12:${label}]`], 'addK'),
  listedSha('add', ['v5.4s', 'v2.4s', 'v4.4s'], 'addK'),
  listedSha('sha256h', ['q16', 'q0', 'v5.4s'], 'rounds', { round }),
];

describe('ARMv8 SHA2 semantics on lane words', () => {
  it('loads H as two registers a … d, e … h (ldp) and reads the chaining value twice', () => {
    const effects = run(listedSha('ldp', ['q1', 'q0', '[x0]'], 'loadState'));
    expect(effects.written).toEqual([
      { reg: 'v1', lanes: varLanes(ABCD, -1) },
      { reg: 'v0', lanes: varLanes(EFGH, -1) },
    ]);
    expect(effects.reads).toEqual([
      { kind: 'mem', base: 'x0', offset: 0, size: 16, valueRef: 'iv' },
      { kind: 'mem', base: 'x0', offset: 16, size: 16, valueRef: 'iv' },
    ]);
  });

  it('loads block bytes unswapped, two word groups per ldp', () => {
    const effects = run(listedSha('ldp', ['q7', 'q17', '[x1, #32]'], 'loadBlock'));
    expect([lanesOf(effects, 0), lanesOf(effects, 1)]).toEqual([
      laneRun(word.wBytes, 8),
      laneRun(word.wBytes, 12),
    ]);
    expect(effects.reads.map((ref) => ref.kind === 'mem' && ref.offset)).toEqual([32, 48]);
    expect(() => run(listedSha('ldp', ['q7', 'q17', '[x1]'], 'msg1'))).toThrow(/no load semantics/);
  });

  it('loads K_t … K_{t+3} of the round its K+W sum feeds, whatever the pool label (no traced read)', () => {
    const effectsFor = (label: string, round = 60) => {
      const listing = literalChain(label, round);
      return shaExecute(
        ARMV8_SHA_PROFILE,
        listing[0]!,
        shaMachine({}, undefined, { listing, index: 0 }),
      );
    };
    const effects = effectsFor('.LCPI0_15');
    expect([lanesOf(effects), effects.reads]).toEqual([laneRun(word.k, 60), []]);
    // Renumbered pool labels (clang's numbering) do not move the constants.
    expect(lanesOf(effectsFor('.LCPI0_16'))).toEqual(laneRun(word.k, 60));
    expect(lanesOf(effectsFor('.LCPI0_0'))).toEqual(laneRun(word.k, 60));
    expect(lanesOf(effectsFor('.LCPI0_15', 8))).toEqual(laneRun(word.k, 8));
    expect(() => run(listedSha('ldr', ['q4', '[x8]'], 'addK'))).toThrow(/round-constant literals/);
    expect(() => run(listedSha('ldr', ['q4', '[x8, :lo12:.LCPI0_1]'], 'loadBlock'))).toThrow(
      /round-constant literals/,
    );
    // A literal no add feeds into a round instruction has no round.
    expect(() => run(listedSha('ldr', ['q4', '[x8, :lo12:.LCPI0_1]'], 'addK'))).toThrow(
      /feed no round instruction/,
    );
  });

  it('derives the same register writes when every pool label of the listing is renumbered', () => {
    const bundle = sharedShaFixtureBundle('sha-256-two-block');
    const relabelled: ShaIsaProfile = {
      ...ARMV8_SHA_PROFILE,
      listing: {
        ...ARMV8_SHA_PROFILE.listing,
        instructions: ARMV8_SHA_PROFILE.listing.instructions.map((instruction) => ({
          ...instruction,
          operands: instruction.operands.map((text) =>
            text.replace(/LCPI0_(\d+)/, (_, n: string) => `LCPI0_${Number(n) + 1}`),
          ),
        })),
      },
    };
    const registersOf = (profile: ShaIsaProfile) =>
      deriveShaIsaFacets(bundle, profile)['registers@aarch64-armv8-sha2'];
    const notesOf = (profile: ShaIsaProfile) =>
      profile.listing.instructions.map((_, index) =>
        armShaNote(profile.listing.instructions, index),
      );
    expect(registersOf(relabelled)).toEqual(registersOf(ARMV8_SHA_PROFILE));
    expect(notesOf(relabelled)).toEqual(notesOf(ARMV8_SHA_PROFILE));
  });

  it('gives adrp and ret no vector effects', () => {
    expect(run(listedSha('adrp', ['x8', '.LCPI0_0']))).toEqual({
      reads: [],
      writes: [],
      written: [],
    });
    expect(run(listedSha('ret', []))).toEqual({ reads: [], writes: [], written: [] });
  });

  it('copies registers (mov) and byte-swaps loaded words (rev32)', () => {
    expect(
      lanesOf(run(listedSha('mov', ['v16.16b', 'v1.16b']), { v1: varLanes(ABCD, -1) })),
    ).toEqual(varLanes(ABCD, -1));
    expect(
      lanesOf(
        run(listedSha('rev32', ['v2.16b', 'v0.16b'], 'byteSwap'), { v0: laneRun(word.wBytes, 0) }),
      ),
    ).toEqual(laneRun(word.w, 0));
    expect(() =>
      run(listedSha('rev32', ['v2.16b', 'v0.16b'], 'byteSwap'), { v0: laneRun(word.kw, 0) }),
    ).toThrow(/byte-swapped lane of v0/);
  });

  it('adds only what the trace records: W + K and the feed-forward', () => {
    expect(
      lanesOf(
        run(listedSha('add', ['v5.4s', 'v2.4s', 'v4.4s'], 'addK'), {
          v2: laneRun(word.w, 0),
          v4: laneRun(word.k, 0),
        }),
      ),
    ).toEqual(laneRun(word.kw, 0));
    expect(
      lanesOf(
        run(listedSha('add', ['v1.4s', 'v4.4s', 'v1.4s'], 'feedForward'), {
          v4: varLanes(ABCD, 63),
          v1: varLanes(ABCD, -1),
        }),
      ),
    ).toEqual(H(ABCD));
    expect(() =>
      run(listedSha('add', ['v5.4s', 'v2.4s', 'v4.4s']), {
        v2: laneRun(word.w, 0),
        v4: laneRun(word.k, 4),
      }),
    ).toThrow(/sum in lane 0/);
  });

  it('runs sha256h: Qd = A … D in and out, Qn = E … H, Vm = K+W of rounds t … t+3', () => {
    const sha256h = listedSha('sha256h', ['q18', 'q3', 'v6.4s'], 'rounds', { round: 4 });
    const before = { v18: varLanes(ABCD, 3), v3: varLanes(EFGH, 3), v6: laneRun(word.kw, 4) };
    const effects = run(sha256h, before);
    expect(lanesOf(effects)).toEqual(varLanes(ABCD, 7));
    expect(effects.reads.map((ref) => ref.kind === 'reg' && ref.name)).toEqual(['v18', 'v3', 'v6']);
    expect(() => run(sha256h, { ...before, v18: varLanes(EFGH, 3) })).toThrow(
      /v18 must hold A…D before round 4/,
    );
    expect(() => run(sha256h, { ...before, v6: laneRun(word.kw, 0) })).toThrow(
      /v6 must hold K\+W of rounds 4…7/,
    );
  });

  it('runs sha256h2: Qd = E … H in and out, Qn = the old A … D (not the one sha256h wrote)', () => {
    const sha256h2 = listedSha('sha256h2', ['q3', 'q16', 'v6.4s'], 'rounds2', { round: 4 });
    const before = { v3: varLanes(EFGH, 3), v16: varLanes(ABCD, 3), v6: laneRun(word.kw, 4) };
    expect(lanesOf(run(sha256h2, before))).toEqual(varLanes(EFGH, 7));
    expect(() => run(sha256h2, { ...before, v16: varLanes(ABCD, 7) })).toThrow(
      /v16 must hold the old A…D before round 4/,
    );
  });

  it('runs su0 (p1 of W_s … W_{s+3}) and su1 (W_s … W_{s+3}) on the right windows', () => {
    const su0 = listedSha('sha256su0', ['v2.4s', 'v4.4s'], 'msg1', { w: 16 });
    expect(lanesOf(run(su0, { v2: laneRun(word.w, 0), v4: laneRun(word.w, 4) }))).toEqual(
      laneRun(word.p1, 16),
    );
    expect(() => run(su0, { v2: laneRun(word.w, 4), v4: laneRun(word.w, 8) })).toThrow(/W0…W3/);
    const su1 = listedSha('sha256su1', ['v2.4s', 'v5.4s', 'v6.4s'], 'msg2', { w: 16 });
    const window = { v2: laneRun(word.p1, 16), v5: laneRun(word.w, 8), v6: laneRun(word.w, 12) };
    const effects = run(su1, window);
    expect(lanesOf(effects)).toEqual(laneRun(word.w, 16));
    expect(effects.reads.map((ref) => ref.kind === 'reg' && ref.name)).toEqual(['v2', 'v5', 'v6']);
    expect(() => run(su1, { ...window, v5: laneRun(word.w, 4) })).toThrow(/W9…W11 in lanes 1–3/);
    expect(() => run(su1, { ...window, v6: laneRun(word.w, 8) })).toThrow(/W12 in lane 0/);
    expect(() => run(listedSha('sha256su1', ['v2.4s', 'v5.4s', 'v6.4s'], 'msg2'), window)).toThrow(
      /no schedule word/,
    );
  });

  it('stores H only, into the chaining value (stp)', () => {
    const stp = listedSha('stp', ['q1', 'q0', '[x0]'], 'store');
    const effects = run(stp, { v1: H(ABCD), v0: H(EFGH) });
    expect(effects.writes).toEqual([
      { kind: 'mem', base: 'x0', offset: 0, size: 16, valueRef: 'h/1' },
      { kind: 'mem', base: 'x0', offset: 16, size: 16, valueRef: 'h/1' },
    ]);
    expect(effects.written).toEqual([]);
    expect(() => run(stp, { v1: H(ABCD), v0: varLanes(EFGH, 63) })).toThrow(/v0 must hold H/);
  });

  it('rejects mnemonics and operands it does not know', () => {
    expect(() => run(listedSha('eor', ['v0.16b', 'v1.16b', 'v2.16b']))).toThrow(/no semantics/);
    expect(() => run(listedSha('mov', ['v0.16b', 'x1']))).toThrow(/not a vector register/);
    expect(() => run(listedSha('mov', ['v0.16b']))).toThrow(/no operand 1/);
    expect(() => run(listedSha('ldp', ['q0', 'q1', 'x1'], 'loadBlock'))).toThrow(
      /not a memory operand/,
    );
  });
});

describe('ARMv8 SHA2 notes', () => {
  const listing = ARMV8_SHA_PROFILE.listing.instructions;
  const note = (index: number) => armShaNote(listing, index);
  const indexOf = (predicate: (instruction: ShaListingInstruction) => boolean) =>
    listing.findIndex(predicate);

  it('explain both halves of a four-round step and the copies they need', () => {
    expect(note(indexOf((i) => i.mnemonic === 'sha256h'))).toEqual({
      key: 'deriver.isa-armv8-sha.note.sha256h',
    });
    expect(note(indexOf((i) => i.mnemonic === 'sha256h2'))).toEqual({
      key: 'deriver.isa-armv8-sha.note.sha256h2',
    });
    // mov v16 ← v1 (ABCD for the first sha256h), mov v3 ← v0 (EFGH, the original kept for the feed-forward).
    expect(note(indexOf((i) => i.address === '0x24'))).toEqual({
      key: 'deriver.isa-armv8-sha.note.copyAbcd',
    });
    expect(note(indexOf((i) => i.address === '0x30'))).toEqual({
      key: 'deriver.isa-armv8-sha.note.copyEfgh',
    });
    const movs = listing.flatMap((instruction, index) =>
      instruction.mnemonic === 'mov' ? [note(index)?.key] : [],
    );
    expect(movs.filter((key) => key?.endsWith('copyAbcd'))).toHaveLength(16);
  });

  it('explain literal-pool round constants and the schedule running ahead', () => {
    expect(
      note(indexOf((i) => i.mnemonic === 'ldr' && i.operands[1]?.includes('.LCPI0_15') === true)),
    ).toEqual({
      key: 'deriver.isa-armv8-sha.note.literalK',
      params: { first: 60, last: 63 },
    });
    expect(note(indexOf((i) => i.mnemonic === 'sha256su1'))).toEqual({
      key: 'deriver.isa-armv8-sha.note.scheduleAhead',
      params: { first: 16, last: 19 },
    });
  });

  it('leave loads, adds and adrp without a note', () => {
    expect(note(0)).toBeUndefined();
    expect(note(indexOf((i) => i.mnemonic === 'adrp'))).toBeUndefined();
    expect(note(indexOf((i) => i.mnemonic === 'add'))).toBeUndefined();
  });
});
