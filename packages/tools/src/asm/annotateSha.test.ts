import { describe, expect, it } from 'vitest';
import {
  annotateShaListing,
  ARMV8_SHA512_ANNOTATE,
  ARMV8_SHA_ANNOTATE,
  X86_SHA_ANNOTATE,
} from './annotateSha.ts';
import { parseInstructionText, type ParsedInstruction } from './parse.ts';

function listing(lines: readonly string[]): (ParsedInstruction & { address: string })[] {
  return lines.map((line, index) => ({
    ...parseInstructionText(line)!,
    address: `0x${(index * 4).toString(16)}`,
  }));
}

function summary(lines: readonly string[], profile = X86_SHA_ANNOTATE): string[] {
  return annotateShaListing(listing(lines), profile).map(
    (entry) =>
      `${entry.role}${entry.round === undefined ? '' : `@${entry.round}`}${entry.w === undefined ? '' : `w${entry.w}`}`,
  );
}

describe('annotateShaListing (x86)', () => {
  it('labels packing, byte swap, W+K, rounds, schedule, feed-forward, unpacking and store', () => {
    expect(
      summary([
        'movdqu xmm0, xmmword ptr [rdi]',
        'movdqu xmm1, xmmword ptr [rdi + 16]',
        'pshufd xmm0, xmm0, 177',
        'movdqa xmm8, xmm0',
        'palignr xmm8, xmm1, 8',
        'movdqa xmm7, xmmword ptr [rip + .LCPI0_0]',
        'movdqu xmm6, xmmword ptr [rsi]',
        'movdqu xmm5, xmmword ptr [rsi + 16]',
        'pshufb xmm6, xmm7',
        'movdqa xmm0, xmmword ptr [rip + .LCPI0_1]',
        'paddd xmm0, xmm6',
        'sha256rnds2 xmm1, xmm8, xmm0',
        'pshufd xmm0, xmm0, 14',
        'pshufd xmm9, xmm8, 27',
        'sha256rnds2 xmm8, xmm1, xmm0',
        'sha256msg1 xmm6, xmm5',
        'movdqa xmm4, xmm5',
        'palignr xmm4, xmm6, 4',
        'paddd xmm4, xmm6',
        'sha256msg2 xmm4, xmm5',
        'paddd xmm4, xmmword ptr [rip + .LCPI0_2]',
        'sha256rnds2 xmm1, xmm8, xmm4',
        'paddd xmm8, xmm9',
        'pshufd xmm0, xmm8, 27',
        'movdqu xmmword ptr [rdi], xmm0',
        'ret',
      ]),
    ).toEqual([
      'loadState',
      'loadState',
      'packState',
      'other',
      'packState',
      'byteSwap',
      'loadBlock',
      'loadBlock',
      'byteSwap',
      'addK',
      'addK',
      'rounds@0',
      'addK',
      'unpackState',
      'rounds@2',
      'msg1w16',
      'other',
      'msg2',
      'msg2',
      'msg2w16',
      'addK',
      'rounds@4',
      'feedForward',
      'unpackState',
      'store',
      'other',
    ]);
  });
  it('labels a feed-forward add that folds the state load (paddd reg, [rdi]) feedForward, not addK', () => {
    expect(
      summary([
        'movdqu xmm1, xmmword ptr [rdi]',
        'sha256rnds2 xmm1, xmm2, xmm0',
        'paddd xmm1, xmmword ptr [rdi]',
        'paddd xmm3, xmmword ptr [rip + .LCPI0_4]',
      ]),
    ).toEqual(['loadState', 'rounds@0', 'feedForward', 'addK']);
  });
});

describe('annotateShaListing (armv8)', () => {
  it('labels ldp loads, rev32, the K add, sha256h/h2 rounds, su0/su1 words and the stp store', () => {
    expect(
      summary(
        [
          'ldp q0, q3, [x1]',
          'adrp x8, .LCPI0_0',
          'ldr q4, [x8, :lo12:.LCPI0_0]',
          'rev32 v2.16b, v0.16b',
          'rev32 v3.16b, v3.16b',
          'ldp q1, q0, [x0]',
          'add v5.4s, v2.4s, v4.4s',
          'mov v16.16b, v1.16b',
          'sha256h q16, q0, v5.4s',
          'sha256h2 q0, q1, v5.4s',
          'sha256su0 v2.4s, v3.4s',
          'sha256su1 v2.4s, v3.4s, v3.4s',
          'sha256h q16, q0, v5.4s',
          'sha256h2 q0, q1, v5.4s',
          'add v1.4s, v16.4s, v1.4s',
          'stp q1, q0, [x0]',
          'ret',
        ],
        ARMV8_SHA_ANNOTATE,
      ),
    ).toEqual([
      'loadBlock',
      'other',
      'addK',
      'byteSwap',
      'byteSwap',
      'loadState',
      'addK',
      'other',
      'rounds@0',
      'rounds2@0',
      'msg1w16',
      'msg2w16',
      'rounds@4',
      'rounds2@4',
      'feedForward',
      'store',
      'other',
    ]);
  });
});

describe('annotateShaListing (armv8 SHA-512)', () => {
  it('labels state ext as packState, the (e,f) add after sha512h as rounds, and numbers W by twos', () => {
    expect(
      summary(
        [
          'ldp q1, q2, [x0, #16]',
          'ldr q3, [x0, #48]',
          'ldr q0, [x0]',
          'ldp q4, q5, [x1]',
          'rev64 v4.16b, v4.16b',
          'rev64 v5.16b, v5.16b',
          'adrp x8, .LCPI0_0',
          'ldr q6, [x8, :lo12:.LCPI0_0]',
          'add v6.2d, v4.2d, v6.2d',
          'ext v6.16b, v6.16b, v6.16b, #8',
          'ext v7.16b, v2.16b, v3.16b, #8',
          'ext v16.16b, v1.16b, v2.16b, #8',
          'add v3.2d, v3.2d, v6.2d',
          'sha512h q3, q7, v16.2d',
          'sha512su0 v4.2d, v5.2d',
          'ext v17.16b, v5.16b, v4.16b, #8',
          'sha512su1 v4.2d, v5.2d, v17.2d',
          'add v18.2d, v1.2d, v3.2d',
          'sha512h2 q3, q1, v0.2d',
          'sha512su0 v5.2d, v4.2d',
          'stp q3, q0, [x0]',
        ],
        ARMV8_SHA512_ANNOTATE,
      ),
    ).toEqual([
      'loadState',
      'loadState',
      'loadState',
      'loadBlock',
      'byteSwap',
      'byteSwap',
      'other',
      'addK',
      'addK',
      'addK',
      'packState',
      'packState',
      'addK',
      'rounds@0',
      'msg1w16',
      'msg2',
      'msg2w16',
      'rounds@0',
      'rounds2@0',
      'msg1w18',
      'store',
    ]);
  });

  it('keeps a feed-forward that clang reassociated with the last sha512h output as feedForward', () => {
    expect(
      summary(
        [
          'ldp q1, q2, [x0, #16]',
          'sha512h q7, q18, v19.2d',
          'add v2.2d, v6.2d, v2.2d',
          'add v2.2d, v2.2d, v7.2d',
          'add v8.2d, v1.2d, v7.2d',
        ],
        ARMV8_SHA512_ANNOTATE,
      ),
    ).toEqual(['loadState', 'rounds@0', 'feedForward', 'feedForward', 'rounds@0']);
  });
});
