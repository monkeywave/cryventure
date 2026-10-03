import type { Instruction, InstructionsFacet } from '@cryventure/core';
import { describe, expect, it } from 'vitest';
import { isaFixture } from '../testing/isaFixture.ts';
import fixture from './fixtures/aesC1.json';
import { listingProgress, operandValueRefs, rowStatus } from './instructionsModel.ts';

const { derivedFacets: aesDerivedFacets } = isaFixture(fixture);

const x86 = aesDerivedFacets['instructions@x86_64-aesni'] as InstructionsFacet;
const arm = aesDerivedFacets['instructions@aarch64-armv8-ce'] as InstructionsFacet;
const at = (facet: InstructionsFacet, address: string) =>
  facet.instructions.find((instruction) => instruction.address === address)!;

describe('listingProgress / rowStatus (current iff first ≤ p ≤ last, executed iff last ≤ p)', () => {
  it('marks the last instruction covering the playhead as current', () => {
    expect(listingProgress(x86, 0)).toEqual({ current: 0, applied: 0 });
    expect(listingProgress(x86, 6)).toEqual({ current: 4, applied: 4 });
  });

  it('keeps an instruction in flight current but not executed (aesenc spans steps 3–6)', () => {
    const progress = listingProgress(x86, 4);
    expect(progress).toEqual({ current: 4, applied: 3 });
    expect([2, 3, 4, 5].map((index) => rowStatus(index, progress))).toEqual([
      'executed',
      'executed',
      'current',
      'pending',
    ]);
  });

  it('has no current instruction between spans', () => {
    expect(listingProgress(x86, 1)).toEqual({ current: undefined, applied: 0 });
  });

  it('runs loads before the first step (span −1) on ARM', () => {
    expect(listingProgress(arm, -1)).toEqual({ current: 0, applied: 0 });
  });
});

describe('operandValueRefs', () => {
  it('matches registers and memory bases by name', () => {
    expect(operandValueRefs(at(x86, '0xc'))).toEqual([['1/roundKey'], ['1/roundKey']]);
    expect(operandValueRefs(at(x86, '0x11'))).toEqual([[], ['1/roundKey']]);
  });

  it('maps aliases (q1 for v1) to the remaining register refs in order', () => {
    expect(operandValueRefs(at(arm, '0x0'))).toEqual([
      ['0/roundKey'],
      ['1/roundKey'],
      ['0/roundKey', '1/roundKey'],
    ]);
  });

  it('treats a register printed twice as destination first, then source', () => {
    expect(operandValueRefs(at(arm, '0x68'))).toEqual([['ciphertext'], ['10/roundKey'], []]);
  });

  it('gives operands without refs no ValueRefs', () => {
    const ret: Instruction = {
      address: '0x0',
      mnemonic: 'ret',
      operands: [],
      reads: [],
      writes: [],
      align: { first: 0, last: 0 },
    };
    expect(operandValueRefs(ret)).toEqual([]);
  });
});
