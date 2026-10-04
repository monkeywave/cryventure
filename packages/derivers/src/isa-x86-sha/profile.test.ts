import { describe, expect, it } from 'vitest';
import type { ShaListingInstruction } from '../_lib/listing.ts';
import { shaExecute } from '../_lib/sha/shaDerivation.ts';
import { listedSha, shaMachine } from '../_lib/sha/fixtures/shaChecks.ts';
import { laneRun, varLanes, word, type Lanes } from '../_lib/sha/shaWords.ts';
import { listingShape } from '../_lib/sha/shaSpans.ts';
import { BYTE_SWAP_MASK, X86_SHA_PROFILE, x86ShaNote } from './profile.ts';

const ABEF = ['f', 'e', 'b', 'a'] as const;
const CDGH = ['h', 'g', 'd', 'c'] as const;
const MASK: Lanes = laneRun(
  (lane) => ({ kind: 'const', bytes: BYTE_SWAP_MASK.slice(4 * lane, 4 * lane + 4) }),
  0,
);

const run = (
  instruction: ShaListingInstruction,
  contents: Record<string, Lanes>,
  nextRound?: number,
) => shaExecute(X86_SHA_PROFILE, instruction, shaMachine(contents, nextRound));
const lanesOf = (effects: ReturnType<typeof run>) => effects.written[0]!.lanes;

describe('x86 SHA-NI semantics on lane words', () => {
  it('loads H as a … h (lane 0 = the lowest address) and reads the chaining value', () => {
    const effects = run(listedSha('movdqu', ['xmm1', 'xmmword ptr [rdi + 16]'], 'loadState'), {});
    expect(lanesOf(effects)).toEqual(varLanes(['e', 'f', 'g', 'h'], -1));
    expect(effects.reads).toEqual([
      { kind: 'mem', base: 'rdi', offset: 16, size: 16, valueRef: 'iv' },
    ]);
  });

  it('loads block bytes unswapped, the byte-swap mask and K_t … K_{t+3} of the next round instruction', () => {
    expect(
      lanesOf(run(listedSha('movdqu', ['xmm5', 'xmmword ptr [rsi + 16]'], 'loadBlock'), {})),
    ).toEqual(laneRun(word.wBytes, 4));
    const mask = run(listedSha('movdqa', ['xmm7', 'xmmword ptr [rip + .LCPI0_0]'], 'byteSwap'), {});
    expect([lanesOf(mask), mask.reads]).toEqual([MASK, []]);
    expect(
      lanesOf(run(listedSha('movdqa', ['xmm0', 'xmmword ptr [rip + .LCPI0_3]'], 'addK'), {}, 8)),
    ).toEqual(laneRun(word.k, 8));
    expect(() =>
      run(listedSha('movdqa', ['xmm0', 'xmmword ptr [rip + .LCPI0_3]'], 'addK'), {}),
    ).toThrow(/after the last round/);
    expect(() =>
      run(listedSha('movdqa', ['xmm0', 'xmmword ptr [rip + .LCPI0_3]'], 'msg2'), {}),
    ).toThrow(/no load semantics/);
  });

  it('packs a … h into ABEF / CDGH as the listing does (pshufd 177/27, palignr 8, pblendw 240)', () => {
    const cdab = lanesOf(
      run(listedSha('pshufd', ['xmm0', 'xmm0', '177']), {
        xmm0: varLanes(['a', 'b', 'c', 'd'], -1),
      }),
    );
    const efgh = lanesOf(
      run(listedSha('pshufd', ['xmm1', 'xmm1', '27']), {
        xmm1: varLanes(['e', 'f', 'g', 'h'], -1),
      }),
    );
    expect(
      lanesOf(run(listedSha('palignr', ['xmm8', 'xmm1', '8']), { xmm8: cdab, xmm1: efgh })),
    ).toEqual(varLanes(ABEF, -1));
    expect(
      lanesOf(run(listedSha('pblendw', ['xmm1', 'xmm0', '240']), { xmm1: efgh, xmm0: cdab })),
    ).toEqual(varLanes(CDGH, -1));
  });

  it('refuses byte-granular lane moves it cannot express as dwords', () => {
    const lanes = { xmm1: laneRun(word.w, 0), xmm2: laneRun(word.w, 4) };
    expect(() => run(listedSha('palignr', ['xmm1', 'xmm2', '2']), lanes)).toThrow(
      /palignr by 2 bytes/,
    );
    expect(() => run(listedSha('pblendw', ['xmm1', 'xmm2', '1']), lanes)).toThrow(/splits dword 0/);
  });

  it('byte-swaps loaded words with the mask only', () => {
    expect(
      lanesOf(
        run(listedSha('pshufb', ['xmm6', 'xmm7']), { xmm6: laneRun(word.wBytes, 0), xmm7: MASK }),
      ),
    ).toEqual(laneRun(word.w, 0));
    expect(() =>
      run(listedSha('pshufb', ['xmm6', 'xmm7']), {
        xmm6: laneRun(word.wBytes, 0),
        xmm7: laneRun(word.w, 0),
      }),
    ).toThrow(/byte-swap mask/);
    expect(() =>
      run(listedSha('pshufb', ['xmm6', 'xmm7']), { xmm6: laneRun(word.kw, 0), xmm7: MASK }),
    ).toThrow(/byte-swapped lane/);
  });

  it('adds only what the trace records: K+W (also from a literal), p1 + W[t−7], the feed-forward', () => {
    expect(
      lanesOf(
        run(listedSha('paddd', ['xmm0', 'xmm6'], 'addK'), {
          xmm0: laneRun(word.k, 4),
          xmm6: laneRun(word.w, 4),
        }),
      ),
    ).toEqual(laneRun(word.kw, 4));
    expect(
      lanesOf(
        run(
          listedSha('paddd', ['xmm0', 'xmmword ptr [rip + .LCPI0_16]'], 'addK'),
          { xmm0: laneRun(word.w, 60) },
          60,
        ),
      ),
    ).toEqual(laneRun(word.kw, 60));
    expect(
      lanesOf(
        run(listedSha('paddd', ['xmm7', 'xmm6'], 'msg2'), {
          xmm7: laneRun(word.w, 9),
          xmm6: laneRun(word.p1, 16),
        }),
      ),
    ).toEqual(laneRun(word.p2, 16));
    expect(
      lanesOf(
        run(listedSha('paddd', ['xmm2', 'xmm1'], 'feedForward'), {
          xmm2: varLanes(ABEF, 61),
          xmm1: varLanes(CDGH, -1),
        }),
      ),
    ).toEqual(CDGH.map((name) => word.h(name)));
    expect(() =>
      run(listedSha('paddd', ['xmm0', 'xmm6']), {
        xmm0: laneRun(word.k, 4),
        xmm6: laneRun(word.w, 8),
      }),
    ).toThrow(/sum in lane 0/);
  });

  it('throws on a state/block memory operand it cannot parse instead of reading word 0', () => {
    const lanes = { xmm1: varLanes(['a', 'b', 'c', 'd'], 63) };
    expect(() =>
      run(listedSha('paddd', ['xmm1', 'xmmword ptr [rdi + rax]'], 'loadState'), lanes),
    ).toThrow(/"xmmword ptr \[rdi \+ rax\]" is not a memory operand/);
  });

  it('runs sha256rnds2 with xmm1 = CDGH in / ABEF out, xmm2 = ABEF and K+W in the low half of xmm0', () => {
    const before = { xmm2: varLanes(CDGH, 3), xmm8: varLanes(ABEF, 3), xmm0: laneRun(word.kw, 4) };
    const effects = run(
      listedSha('sha256rnds2', ['xmm2', 'xmm8', 'xmm0'], 'rounds', { round: 4 }),
      before,
    );
    expect(lanesOf(effects)).toEqual(varLanes(ABEF, 5));
    expect(effects.reads.map((ref) => ref.kind === 'reg' && ref.name)).toEqual([
      'xmm2',
      'xmm8',
      'xmm0',
    ]);
    const swapped = { ...before, xmm2: varLanes(ABEF, 3), xmm8: varLanes(CDGH, 3) };
    expect(() =>
      run(listedSha('sha256rnds2', ['xmm2', 'xmm8', 'xmm0'], 'rounds', { round: 4 }), swapped),
    ).toThrow(/xmm2 must hold CDGH before round 4/);
    const wrongWk = { ...before, xmm0: [word.kw(6), word.kw(7), word.kw(4), word.kw(4)] };
    expect(() =>
      run(listedSha('sha256rnds2', ['xmm2', 'xmm8', 'xmm0'], 'rounds', { round: 4 }), wrongWk),
    ).toThrow(/K\+W of rounds 4, 5/);
  });

  it('runs msg1 (p1 of W_s … W_{s+3}) and msg2 (W_s … W_{s+3}) on the right windows', () => {
    const msg1 = listedSha('sha256msg1', ['xmm6', 'xmm5'], 'msg1', { w: 16 });
    expect(lanesOf(run(msg1, { xmm6: laneRun(word.w, 0), xmm5: laneRun(word.w, 4) }))).toEqual(
      laneRun(word.p1, 16),
    );
    expect(() => run(msg1, { xmm6: laneRun(word.w, 4), xmm5: laneRun(word.w, 8) })).toThrow(
      /W0…W3/,
    );
    const msg2 = listedSha('sha256msg2', ['xmm7', 'xmm3'], 'msg2', { w: 16 });
    expect(lanesOf(run(msg2, { xmm7: laneRun(word.p2, 16), xmm3: laneRun(word.w, 12) }))).toEqual(
      laneRun(word.w, 16),
    );
    expect(() => run(msg2, { xmm7: laneRun(word.p2, 16), xmm3: laneRun(word.w, 8) })).toThrow(
      /W14, W15 in lanes 2, 3/,
    );
    expect(() => run(listedSha('sha256msg2', ['xmm7', 'xmm3'], 'msg2'), {})).toThrow(
      /read before it is written/,
    );
  });

  it('stores H only, into the chaining value', () => {
    const store = listedSha('movdqu', ['xmmword ptr [rdi + 16]', 'xmm0'], 'store');
    const effects = run(store, {
      xmm0: (['e', 'f', 'g', 'h'] as const).map((name) => word.h(name)),
    });
    expect(effects.writes).toEqual([
      { kind: 'mem', base: 'rdi', offset: 16, size: 16, valueRef: 'h/1' },
    ]);
    expect(effects.written).toEqual([]);
    expect(() => run(store, { xmm0: varLanes(['e', 'f', 'g', 'h'], 63) })).toThrow(/must hold H/);
  });

  it('rejects mnemonics and operands it does not know', () => {
    expect(() => run(listedSha('vpaddd', ['xmm0', 'xmm1']), {})).toThrow(/no semantics/);
    expect(() => run(listedSha('pshufd', ['xmm0', 'rax', '0']), {})).toThrow(/not an xmm register/);
    expect(() => run(listedSha('pshufd', ['xmm0', 'xmm0', 'x']), { xmm0: [] })).toThrow(
      /not an immediate/,
    );
    expect(() => run(listedSha('pshufd', ['xmm0', 'xmm0']), {})).toThrow(/no operand 2/);
  });
});

describe('x86 SHA-NI notes', () => {
  const listing = X86_SHA_PROFILE.listing.instructions;
  const shape = listingShape(listing);
  const note = (index: number) => x86ShaNote(listing, index, shape);
  const indexOf = (predicate: (instruction: ShaListingInstruction) => boolean) =>
    listing.findIndex(predicate);

  it('explain sha256rnds2, the W+K shuffle, the schedule running ahead and the early feed-forward copy', () => {
    expect(note(indexOf((i) => i.mnemonic === 'sha256rnds2'))).toEqual({
      key: 'deriver.isa-x86-sha.note.rnds2',
    });
    expect(note(indexOf((i) => i.role === 'addK' && i.mnemonic === 'pshufd'))).toEqual({
      key: 'deriver.isa-x86-sha.note.nextWk',
      params: { first: 2, last: 3 },
    });
    expect(note(indexOf((i) => i.mnemonic === 'sha256msg2'))).toEqual({
      key: 'deriver.isa-x86-sha.note.scheduleAhead',
      params: { first: 16, last: 19 },
    });
    expect(note(indexOf((i) => i.role === 'unpackState'))).toEqual({
      key: 'deriver.isa-x86-sha.note.earlySave',
    });
  });

  it('leave loads, msg2 helpers and the final unpacking without a note', () => {
    expect(note(0)).toBeUndefined();
    expect(note(indexOf((i) => i.mnemonic === 'palignr' && i.role === 'msg2'))).toBeUndefined();
    expect(note(listing.findLastIndex((i) => i.role === 'unpackState'))).toBeUndefined();
  });
});
