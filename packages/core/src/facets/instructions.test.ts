import { describe, expect, it } from 'vitest';
import { i18nRef } from '../i18n.ts';
import { validateInstructionsFacet, type Instruction, type InstructionsFacet } from './instructions.ts';

const instruction = (address: string, first: number, last: number, extra: Partial<Instruction> = {}): Instruction => ({
  address,
  mnemonic: 'aesenc',
  operands: ['xmm0', 'xmm1'],
  reads: [{ kind: 'reg', name: 'xmm0' }, { kind: 'reg', name: 'xmm1', valueRef: 'rk1' }],
  writes: [{ kind: 'reg', name: 'xmm0' }],
  align: { first, last },
  ...extra,
});

const facet = (instructions: Instruction[]): InstructionsFacet => ({
  kind: 'instructions',
  schemaVersion: 1,
  isa: 'x86_64',
  extension: 'aesni',
  label: i18nRef('isa.x86.label'),
  syntax: 'intel',
  source: { compiler: 'gcc 14', flags: '-O2 -maes', triple: 'x86_64-linux-gnu', function: 'aes128_encrypt' },
  instructions,
});

const load = instruction('0x0', -1, -1, {
  mnemonic: 'movdqu',
  operands: ['xmm0', '[rdi]'],
  reads: [{ kind: 'mem', base: 'rdi', offset: 0, size: 16 }],
});

describe('validateInstructionsFacet', () => {
  it('accepts a well-formed listing', () => {
    expect(validateInstructionsFacet(facet([load, instruction('0x4', 0, 3), instruction('0x9', 4, 7), instruction('0xe', 7, 7)]))).toEqual([]);
    expect(validateInstructionsFacet(facet([]))).toEqual([]);
  });
  it('rejects addresses that are not lowercase hex', () => {
    expect(validateInstructionsFacet(facet([instruction('0x1A', 0, 0), instruction('16', 1, 1)]))).toEqual([
      'instructions: instruction 0: address "0x1A" is not lowercase hex',
      'instructions: instruction 1: address "16" is not lowercase hex',
    ]);
  });
  it('rejects an empty mnemonic and malformed operands', () => {
    const bad = instruction('0x0', 0, 0, {
      mnemonic: '',
      reads: [{ kind: 'reg', name: '' }],
      writes: [{ kind: 'mem', base: 'rsp', offset: 1.5, size: 0 }],
    });
    expect(validateInstructionsFacet(facet([bad]))).toEqual([
      'instructions: instruction 0: empty mnemonic',
      'instructions: instruction 0: register operand without a name',
      'instructions: instruction 0: memory operand offset 1.5 / size 0 invalid',
    ]);
  });
  it('rejects malformed or decreasing spans', () => {
    expect(validateInstructionsFacet(facet([instruction('0x0', 3, 1), instruction('0x4', 0, 0)]))).toEqual([
      'instructions: span 0 first 3 > last 1',
      'instructions: span 1 first 0 decreases (after 3)',
      'instructions: span 1 last 0 decreases (after 1)',
    ]);
  });
});

describe('validateInstructionsFacet: kind (M6 review gap)', () => {
  it('rejects a facet of another kind', () => {
    const wrong = { ...facet([load]), kind: 'registers' } as unknown as Parameters<typeof validateInstructionsFacet>[0];
    expect(validateInstructionsFacet(wrong)).toEqual(['instructions: kind registers is not "instructions"']);
  });
});
