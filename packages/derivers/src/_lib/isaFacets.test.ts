import { describe, expect, it } from 'vitest';
import {
  armVectorRegister,
  buildInstruction,
  isaFacetPair,
  listingError,
  memoryOperand,
  registerOperand,
  registerWrite,
  vectorRegisterSpecs,
  x86VectorRegister,
} from './isaFacets.ts';

describe('isaFacets', () => {
  it('lists each register once, by register number', () => {
    expect(vectorRegisterSpecs(['xmm10', 'xmm2', 'xmm10', 'xmm0'], 128, [32])).toEqual([
      { name: 'xmm0', bits: 128, lanes: [32] },
      { name: 'xmm2', bits: 128, lanes: [32] },
      { name: 'xmm10', bits: 128, lanes: [32] },
    ]);
  });

  it('attaches valueRefs only when given', () => {
    expect(registerOperand('v1')).toEqual({ kind: 'reg', name: 'v1' });
    expect(registerOperand('v1', 'iv')).toEqual({ kind: 'reg', name: 'v1', valueRef: 'iv' });
    expect(registerWrite('v1', [1], 'iv')).toEqual({ reg: 'v1', bytes: [1], valueRef: 'iv' });
  });

  it('builds the instructions/registers pair under the variant, labelled in the deriver namespace', () => {
    const facets = isaFacetPair(
      {
        deriverId: 'demo',
        variant: 'v',
        isa: 'x86_64',
        extension: 'e',
        syntax: 'intel',
        byteOrder: 'little',
      },
      { compiler: 'c', flags: 'f', triple: 't', function: 'fn' },
      { instructions: [], steps: [] },
      [],
    );
    expect(Object.keys(facets)).toEqual(['instructions@v', 'registers@v']);
    expect(facets['instructions@v']).toMatchObject({
      label: { key: 'deriver.demo.label' },
      source: { compiler: 'c', flags: 'f', triple: 't', function: 'fn' },
    });
    expect(facets['registers@v']).toMatchObject({
      label: { key: 'deriver.demo.registers.label' },
      file: { isa: 'x86_64', byteOrder: 'little', registers: [] },
    });
  });

  it('names xmm registers as they are and q<n>, v<n>.16b, v<n>.4s as v<n>, nothing else', () => {
    expect(['xmm0', 'xmm15', 'xmmword ptr [rdi]', 'rdx'].map(x86VectorRegister)).toEqual([
      'xmm0',
      'xmm15',
      undefined,
      undefined,
    ]);
    expect(
      ['q1', 'v1.16b', 'v5.4s', 'v12', '[x2, #32]', 'x2', 'qq1'].map(armVectorRegister),
    ).toEqual(['v1', 'v1', 'v5', 'v12', undefined, undefined, undefined]);
  });

  it('builds memory operands with a valueRef only when given', () => {
    expect(memoryOperand({ base: 'rdi', offset: 16 }, 16)).toEqual({
      kind: 'mem',
      base: 'rdi',
      offset: 16,
      size: 16,
    });
    expect(memoryOperand({ base: 'x0', offset: 0 }, 16, 'iv')).toMatchObject({ valueRef: 'iv' });
  });

  it('names the listed instruction in errors, from an Error or a message', () => {
    const listed = { address: '0x10', mnemonic: 'aesenc', operands: [] };
    expect(listingError(listed, 'no keyIndex').message).toBe('listing 0x10 aesenc: no keyIndex');
    expect(listingError(listed, new Error('boom')).message).toBe('listing 0x10 aesenc: boom');
  });

  it('builds an instruction, with covers and a note only when present', () => {
    const listed = { address: '0x0', mnemonic: 'ret', operands: ['x'] };
    const effects = { reads: [], writes: [] };
    expect(buildInstruction(listed, { first: 1, last: 1 }, effects, [], undefined)).toEqual({
      address: '0x0',
      mnemonic: 'ret',
      operands: ['x'],
      reads: [],
      writes: [],
      align: { first: 1, last: 1 },
    });
    const covers = [{ key: 'c' }];
    expect(
      buildInstruction(listed, { first: 1, last: 1 }, effects, covers, { key: 'n' }),
    ).toMatchObject({ covers, note: { key: 'n' } });
  });
});
