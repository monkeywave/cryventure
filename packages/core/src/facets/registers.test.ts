import { describe, expect, it } from 'vitest';
import { i18nRef } from '../i18n.ts';
import { registersAt, validateRegistersFacet, type RegisterStep, type RegistersFacet } from './registers.ts';

const bytes = (fill: number, length = 16): number[] => Array.from({ length }, () => fill);
const step = (first: number, last: number, writes: RegisterStep['writes']): RegisterStep => ({ align: { first, last }, writes });

const facet = (steps: RegisterStep[]): RegistersFacet => ({
  kind: 'registers',
  schemaVersion: 1,
  label: i18nRef('isa.x86.registers'),
  file: {
    isa: 'x86_64',
    byteOrder: 'little',
    registers: [
      { name: 'xmm0', bits: 128, lanes: [8, 32, 64] },
      { name: 'xmm1', bits: 128, lanes: [8, 32] },
    ],
  },
  steps,
});

const listing = facet([step(-1, -1, [{ reg: 'xmm0', bytes: bytes(1) }]), step(0, 3, [{ reg: 'xmm0', bytes: bytes(2), valueRef: 'r1' }, { reg: 'xmm1', bytes: bytes(9) }]), step(4, 7, [{ reg: 'xmm0', bytes: bytes(3) }])]);

describe('validateRegistersFacet', () => {
  it('accepts a well-formed facet', () => expect(validateRegistersFacet(listing)).toEqual([]));
  it('rejects duplicate registers, bad widths and lanes', () => {
    const bad: RegistersFacet = {
      ...listing,
      file: { ...listing.file, registers: [{ name: 'v0', bits: 12, lanes: [8] }, { name: 'v1', bits: 128, lanes: [8, 48, 0] }, { name: 'v1', bits: 128, lanes: [] }] },
      steps: [],
    };
    expect(validateRegistersFacet(bad)).toEqual([
      'registers: register "v0": bits 12 is not a positive multiple of 8',
      'registers: register "v1": lane width 48 does not divide 128',
      'registers: register "v1": lane width 0 does not divide 128',
      'registers: duplicate register "v1"',
    ]);
  });
  it('rejects writes to unknown registers, of the wrong width, or of non-bytes', () => {
    const bad = facet([step(0, 0, [{ reg: 'xmm7', bytes: bytes(0) }, { reg: 'xmm0', bytes: [...bytes(0, 15), 256] }, { reg: 'xmm1', bytes: bytes(0, 8) }])]);
    expect(validateRegistersFacet(bad)).toEqual([
      'registers: step 0: unknown register "xmm7"',
      'registers: step 0: 256 is not a byte',
      'registers: step 0: 8 bytes for 128-bit "xmm1"',
    ]);
  });
  it('rejects malformed or decreasing spans', () => {
    expect(validateRegistersFacet(facet([step(2, 2, []), step(1, 0, [])]))).toEqual([
      'registers: span 1 first 1 > last 0',
      'registers: span 1 first 1 decreases (after 2)',
      'registers: span 1 last 0 decreases (after 2)',
    ]);
  });
});

describe('registersAt', () => {
  it('lists every register, undefined until written', () => {
    expect(registersAt(facet([]), 5)).toEqual(
      new Map([
        ['xmm0', undefined],
        ['xmm1', undefined],
      ]),
    );
  });
  it('replays the steps whose span has ended (last ≤ p)', () => {
    expect(registersAt(listing, -1).get('xmm0')).toEqual(bytes(1));
    expect(registersAt(listing, -1).get('xmm1')).toBeUndefined();
    expect(registersAt(listing, 3).get('xmm1')).toEqual(bytes(9));
    expect(registersAt(listing, 7).get('xmm0')).toEqual(bytes(3));
  });
  it('shows the registers from before an instruction in flight', () => {
    expect(registersAt(listing, 2).get('xmm0')).toEqual(bytes(1));
    expect(registersAt(listing, 6).get('xmm0')).toEqual(bytes(2));
  });
});

describe('validateRegistersFacet: kind (M6 review gap)', () => {
  it('rejects a facet of another kind', () => {
    const wrong = { ...listing, kind: 'memory' } as unknown as Parameters<typeof validateRegistersFacet>[0];
    expect(validateRegistersFacet(wrong)).toEqual(['registers: kind memory is not "registers"']);
  });
});
