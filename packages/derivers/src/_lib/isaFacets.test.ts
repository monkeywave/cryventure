import { describe, expect, it } from 'vitest';
import { isaFacetPair, registerOperand, registerWrite, vectorRegisterSpecs } from './isaFacets.ts';

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
});
