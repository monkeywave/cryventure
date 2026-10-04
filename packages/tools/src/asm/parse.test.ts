import { describe, expect, it } from 'vitest';
import {
  attachAddresses,
  findLoop,
  formatAddress,
  parseAsmLabels,
  parseAsmFunction,
  parseInstructionText,
  parseObjdumpFunction,
  splitOperands,
  withoutTrailingPadding,
} from './parse.ts';

const X86_ASM = `	.intel_syntax noprefix
	.text
	.globl	f                               # -- Begin function f
	.p2align	4
	.type	f,@function
f:                                      # @f
# %bb.0:
	movdqu	xmm1, xmmword ptr [rdi]         # load state
	pxor	xmm0, xmm1
	ret
.Lfunc_end0:
	.size	f, .Lfunc_end0-f
g:
	nop
`;

const ARM_ASM = `	.text
f:                                      // @f
// %bb.0:
	ldp	q1, q2, [x2, #32]
	aese	v1.16b, v0.16b
.LBB0_1:
	ret
.Lfunc_end0:
`;

const OBJDUMP = `x.o:	file format elf64-x86-64

Disassembly of section .text:

0000000000000000 <f>:
       0:      	movdqu	xmm1, xmmword ptr [rdi]
       4:      	pxor	xmm0, xmm1
       8:      	ret
       9:      	nop

0000000000000010 <g>:
      10:      	nop
`;

describe('splitOperands', () => {
  it('splits on top-level commas only', () => {
    expect(splitOperands('q1, q2, [x2, #32]')).toEqual(['q1', 'q2', '[x2, #32]']);
    expect(splitOperands('xmm0, xmmword ptr [rdx + 16]')).toEqual([
      'xmm0',
      'xmmword ptr [rdx + 16]',
    ]);
    expect(splitOperands('{v0.16b, v1.16b}, [x0]')).toEqual(['{v0.16b, v1.16b}', '[x0]']);
    expect(splitOperands('')).toEqual([]);
  });
});

describe('parseInstructionText', () => {
  it('separates mnemonic and operands', () => {
    expect(parseInstructionText('\taesenc\txmm0, xmm1')).toEqual({
      mnemonic: 'aesenc',
      operands: ['xmm0', 'xmm1'],
    });
    expect(parseInstructionText('ret')).toEqual({ mnemonic: 'ret', operands: [] });
    expect(parseInstructionText('   ')).toBeUndefined();
  });
});

describe('parseAsmFunction', () => {
  it('keeps only instruction lines of the named function (intel, # comments)', () => {
    expect(parseAsmFunction(X86_ASM, 'f', 'intel')).toEqual([
      { mnemonic: 'movdqu', operands: ['xmm1', 'xmmword ptr [rdi]'] },
      { mnemonic: 'pxor', operands: ['xmm0', 'xmm1'] },
      { mnemonic: 'ret', operands: [] },
    ]);
  });

  it('keeps # immediates on ARM and strips // comments and local labels', () => {
    expect(parseAsmFunction(ARM_ASM, 'f', 'arm')).toEqual([
      { mnemonic: 'ldp', operands: ['q1', 'q2', '[x2, #32]'] },
      { mnemonic: 'aese', operands: ['v1.16b', 'v0.16b'] },
      { mnemonic: 'ret', operands: [] },
    ]);
  });

  it('throws for an unknown function', () => {
    expect(() => parseAsmFunction(X86_ASM, 'missing', 'intel')).toThrow(/not found/);
  });
});

describe('parseObjdumpFunction', () => {
  it('reads byte offsets of the named symbol only', () => {
    const parsed = parseObjdumpFunction(OBJDUMP, 'f');
    expect(parsed.map((entry) => [entry.offset, entry.mnemonic])).toEqual([
      [0, 'movdqu'],
      [4, 'pxor'],
      [8, 'ret'],
      [9, 'nop'],
    ]);
    expect(parseObjdumpFunction(OBJDUMP, 'g')).toEqual([
      { mnemonic: 'nop', operands: [], offset: 16 },
    ]);
  });

  it('throws for an unknown symbol', () => {
    expect(() => parseObjdumpFunction(OBJDUMP, 'missing')).toThrow(/not found/);
  });
});

describe('attachAddresses', () => {
  const listing = parseAsmFunction(X86_ASM, 'f', 'intel');

  it('pairs listing and objdump offsets, ignoring trailing padding', () => {
    expect(
      attachAddresses(listing, parseObjdumpFunction(OBJDUMP, 'f')).map((entry) => entry.address),
    ).toEqual(['0x0', '0x4', '0x8']);
  });

  it('rebases offsets to the function start (a later function in .text still starts at 0x0)', () => {
    const shifted = parseObjdumpFunction(OBJDUMP, 'f').map((entry) => ({
      ...entry,
      offset: entry.offset + 0x80,
    }));
    expect(attachAddresses(listing, shifted).map((entry) => entry.address)).toEqual([
      '0x0',
      '0x4',
      '0x8',
    ]);
  });

  it('throws on a count or mnemonic mismatch', () => {
    const dump = parseObjdumpFunction(OBJDUMP, 'f');
    expect(() => attachAddresses(listing.slice(1), dump)).toThrow(/instructions/);
    expect(() => attachAddresses([listing[1]!, listing[0]!, listing[2]!], dump)).toThrow(
      /mnemonic|listing/,
    );
  });

  it('withoutTrailingPadding drops only trailing nops', () => {
    const dump = parseObjdumpFunction(OBJDUMP, 'f');
    expect(withoutTrailingPadding(dump).map((entry) => entry.mnemonic)).toEqual([
      'movdqu',
      'pxor',
      'ret',
    ]);
  });

  it('formats addresses as 0x-prefixed hex', () => {
    expect(formatAddress(0x7d)).toBe('0x7d');
  });
});

const ARM_LOOP_ASM = `keccak:                                 // @keccak
// %bb.0:
	mov	x8, xzr
.LBB0_1:                                // =>This Inner Loop Header: Depth=1
	eor3	v9.16b, v11.16b, v6.16b, v18.16b
	add	x8, x8, #8
	cmp	x8, #192
	b.ne	.LBB0_1
// %bb.2:
	ret
.Lfunc_end0:
`;

describe('parseAsmLabels', () => {
  it('maps each label to the index of the instruction after it', () => {
    expect(parseAsmLabels(ARM_LOOP_ASM, 'keccak', 'arm')).toEqual(new Map([['.LBB0_1', 1]]));
    expect(parseAsmLabels(ARM_ASM, 'f', 'arm')).toEqual(new Map([['.LBB0_1', 2]]));
  });
});

describe('findLoop', () => {
  it('finds the body from the branch target through the backward branch', () => {
    const instructions = parseAsmFunction(ARM_LOOP_ASM, 'keccak', 'arm');
    const labels = parseAsmLabels(ARM_LOOP_ASM, 'keccak', 'arm');
    expect(findLoop(instructions, labels)).toEqual({ firstIndex: 1, lastIndex: 4 });
  });

  it('throws without a backward branch, and for a forward one', () => {
    const straight = parseAsmFunction(ARM_ASM, 'f', 'arm');
    expect(() => findLoop(straight, new Map())).toThrow(/found 0/);
    const forward = [parseInstructionText('b .LBB0_1')!, parseInstructionText('ret')!];
    expect(() => findLoop(forward, new Map([['.LBB0_1', 1]]))).toThrow(/found 0/);
  });
});
