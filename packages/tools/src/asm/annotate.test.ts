import { describe, expect, it } from 'vitest';
import {
  annotateListing,
  ARMV8_PROFILE,
  canonicalRegister,
  parseMemoryOperand,
  X86_PROFILE,
} from './annotate.ts';
import { parseInstructionText, type ParsedInstruction } from './parse.ts';

function listing(lines: readonly string[]): (ParsedInstruction & { address: string })[] {
  return lines.map((line, index) => ({
    ...parseInstructionText(line)!,
    address: `0x${(index * 4).toString(16)}`,
  }));
}

function summary(lines: readonly string[], profile = X86_PROFILE): string[] {
  return annotateListing(listing(lines), profile).map(
    (entry) =>
      `${entry.role}${entry.round === undefined ? '' : `@${entry.round}`}${entry.keyIndex === undefined ? '' : `k${entry.keyIndex}`}`,
  );
}

describe('parseMemoryOperand', () => {
  it('reads base and offset in Intel and ARM syntax', () => {
    expect(parseMemoryOperand('xmmword ptr [rdx + 16]')).toEqual({ base: 'rdx', offset: 16 });
    expect(parseMemoryOperand('xmmword ptr [rdi]')).toEqual({ base: 'rdi', offset: 0 });
    expect(parseMemoryOperand('[x2, #32]')).toEqual({ base: 'x2', offset: 32 });
    expect(parseMemoryOperand('[x2, #0x20]')).toEqual({ base: 'x2', offset: 32 });
    expect(parseMemoryOperand('xmm0')).toBeUndefined();
  });
});

describe('canonicalRegister', () => {
  it('maps q/v views of one ARM register to the same name', () => {
    expect(canonicalRegister('q3')).toBe('v3');
    expect(canonicalRegister('v3.16b')).toBe('v3');
    expect(canonicalRegister('xmm3')).toBe('xmm3');
  });
});

describe('annotateListing (x86)', () => {
  it('labels loads, ark0, rounds, last round and store', () => {
    expect(
      summary([
        'movdqu xmm1, xmmword ptr [rdi]',
        'movdqu xmm0, xmmword ptr [rdx]',
        'pxor xmm0, xmm1',
        'movdqu xmm1, xmmword ptr [rdx + 16]',
        'aesenc xmm0, xmm1',
        'aesenclast xmm0, xmmword ptr [rdx + 32]',
        'movdqu xmmword ptr [rsi], xmm0',
        'ret',
      ]),
    ).toEqual([
      'loadState',
      'loadKeyk0',
      'ark0@0k0',
      'loadKeyk1',
      'round@1k1',
      'lastRound@2k2',
      'store',
      'other',
    ]);
  });

  it('does not call a xor without round key 0 an ark0', () => {
    expect(summary(['movdqu xmm1, xmmword ptr [rdi]', 'pxor xmm1, xmm1'])).toEqual([
      'loadState',
      'other',
    ]);
  });
});

describe('annotateListing (armv8)', () => {
  it('follows swapped aese operands, ldp pairs and the final eor', () => {
    expect(
      summary(
        [
          'ldp q1, q2, [x2]',
          'ldr q0, [x0]',
          'aese v1.16b, v0.16b',
          'aesmc v1.16b, v1.16b',
          'aese v2.16b, v1.16b',
          'ldr q0, [x2, #32]',
          'eor v0.16b, v0.16b, v2.16b',
          'str q0, [x1]',
          'ret',
        ],
        ARMV8_PROFILE,
      ),
    ).toEqual([
      'loadKeyk0',
      'loadState',
      'round@1k0',
      'aesmc@1',
      'lastRound@2k1',
      'loadKeyk2',
      'finalXor@2k2',
      'store',
      'other',
    ]);
  });

  it('marks loads from an unknown base as other', () => {
    expect(summary(['ldr q5, [x9, #16]'], ARMV8_PROFILE)).toEqual(['other']);
  });
});
