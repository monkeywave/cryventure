import { toHex, type AnyStateFacet } from '@cryventure/core';
import { describe, expect, it } from 'vitest';
import { aesFixtureBundle } from './fixtures/aesBundles.ts';
import {
  isaFacetProblems,
  isaFacets,
  registerAfter,
  unknownValueRefs,
} from './fixtures/isaChecks.ts';
import { deriveIsaFacets, listingRegisters, type IsaProfile } from './isaDerivation.ts';
import type { CoveredOp } from './isaSpans.ts';
import type { Listing, ListingInstruction } from './listing.ts';

/** A toy two-operand ISA (`r0`, `r1`, …) whose `enc` does a whole AES round, like AES-NI. */
function toyListing(): Listing {
  const at = (index: number) => `0x${index.toString(16)}`;
  const body: Omit<ListingInstruction, 'address'>[] = [
    { mnemonic: 'ld', operands: ['r3', '[a0]'], role: 'loadState' },
    { mnemonic: 'ld', operands: ['r0', '[a2]'], role: 'loadKey', keyIndex: 0 },
    { mnemonic: 'xor', operands: ['r0', 'r3'], role: 'ark0', round: 0, keyIndex: 0 },
  ];
  for (let round = 1; round <= 10; round++) {
    body.push({
      mnemonic: 'ld',
      operands: ['r1', `[a2 + ${16 * round}]`],
      role: 'loadKey',
      keyIndex: round,
    });
    body.push({
      mnemonic: round === 10 ? 'enclast' : 'enc',
      operands: ['r0', 'r1'],
      role: round === 10 ? 'lastRound' : 'round',
      round,
      keyIndex: round,
    });
  }
  body.push(
    { mnemonic: 'st', operands: ['[a1]', 'r0'], role: 'store' },
    { mnemonic: 'ret', operands: [], role: 'other' },
  );
  const instructions = body.map((instruction, index) => ({ ...instruction, address: at(index) }));
  return { compiler: 'toy', flags: '-O2', triple: 'toy', function: 'f', source: '', instructions };
}

function toyCovers(instruction: ListingInstruction): CoveredOp[] {
  const round = instruction.round ?? 0;
  if (instruction.role === 'ark0') return [{ op: 'addRoundKey', round: 0 }];
  if (instruction.role === 'round')
    return (['subBytes', 'shiftRows', 'mixColumns', 'addRoundKey'] as const).map((op) => ({
      op,
      round,
    }));
  if (instruction.role === 'lastRound')
    return (['subBytes', 'shiftRows', 'addRoundKey'] as const).map((op) => ({ op, round }));
  return [];
}

function toyProfile(listing: Listing = toyListing()): IsaProfile {
  return {
    deriverId: 'isa-toy',
    variant: 'toy',
    isa: 'toy',
    extension: 'aes',
    syntax: 'intel',
    byteOrder: 'little',
    lanes: [8, 32],
    listings: { 10: listing },
    vectorRegister: (operand) => (/^r\d+$/.test(operand) ? operand : undefined),
    covers: toyCovers,
  };
}

const bundle = () => aesFixtureBundle('fips197-c1');

describe('deriveIsaFacets', () => {
  it('derives valid instructions@<variant> and registers@<variant> facets', () => {
    const derived = deriveIsaFacets(bundle(), toyProfile());
    expect(Object.keys(derived)).toEqual(['instructions@toy', 'registers@toy']);
    const facets = isaFacets(derived, 'toy');
    expect(isaFacetProblems(facets, bundle())).toEqual([]);
    expect(unknownValueRefs(facets, bundle())).toEqual([]);
    expect(facets.instructions.label).toEqual({ key: 'deriver.isa-toy.label' });
    expect(facets.registers.label).toEqual({ key: 'deriver.isa-toy.registers.label' });
    expect(facets.instructions.source).toEqual({
      compiler: 'toy',
      flags: '-O2',
      triple: 'toy',
      function: 'f',
    });
  });

  it('reads register values from the trace and links keys, plaintext and ciphertext', () => {
    const facets = isaFacets(deriveIsaFacets(bundle(), toyProfile()), 'toy');
    expect(toHex(registerAfter(facets, 0, 'r3'))).toBe('00112233445566778899aabbccddeeff');
    expect(toHex(registerAfter(facets, 4, 'r0'))).toBe('89d810e8855ace682d1843d8cb128fe4');
    const last = facets.instructions.instructions[22]!;
    expect(last.writes).toEqual([{ kind: 'reg', name: 'r0', valueRef: 'ciphertext' }]);
    expect(last.reads).toEqual([
      { kind: 'reg', name: 'r0' },
      { kind: 'reg', name: 'r1', valueRef: '10/roundKey' },
    ]);
    expect(facets.instructions.instructions[3]!.reads).toEqual([
      { kind: 'mem', base: 'a2', offset: 16, size: 16, valueRef: '1/roundKey' },
    ]);
  });

  it('adds covers refs in the deriver namespace and a register step only for register writes', () => {
    const facets = isaFacets(deriveIsaFacets(bundle(), toyProfile()), 'toy');
    expect(facets.instructions.instructions[2]!.covers).toEqual([
      { key: 'deriver.isa-toy.op.addRoundKey', params: { round: 0 } },
    ]);
    expect(facets.instructions.instructions[0]!.covers).toBeUndefined();
    expect(facets.registers.steps).toHaveLength(facets.instructions.instructions.length - 2);
  });

  it('throws when an AES instruction reads a register holding neither the state nor its key', () => {
    const listing = toyListing();
    listing.instructions[4]!.operands = ['r0', 'r7'];
    expect(() => deriveIsaFacets(bundle(), toyProfile(listing))).toThrow(
      /r7 holds neither the state nor round key 1/,
    );
  });

  it('throws when the key operand is missing or the store reads a stale register', () => {
    const keyless = toyListing();
    keyless.instructions[4]!.operands = ['r0', 'r0'];
    expect(() => deriveIsaFacets(bundle(), toyProfile(keyless))).toThrow(/state and its round key/);
    const stale = toyListing();
    stale.instructions[23]!.operands = ['[a1]', 'r3'];
    expect(() => deriveIsaFacets(bundle(), toyProfile(stale))).toThrow(
      /r3 does not hold the state/,
    );
  });

  it('throws for a load without keyIndex, without memory operand or with two state registers', () => {
    const noIndex = toyListing();
    delete noIndex.instructions[1]!.keyIndex;
    expect(() => deriveIsaFacets(bundle(), toyProfile(noIndex))).toThrow(/no keyIndex/);
    const noMem = toyListing();
    noMem.instructions[1]!.operands = ['r0'];
    expect(() => deriveIsaFacets(bundle(), toyProfile(noMem))).toThrow(/no memory operand/);
    const twoState = toyListing();
    twoState.instructions[0]!.operands = ['r3', 'r4', '[a0]'];
    expect(() => deriveIsaFacets(bundle(), toyProfile(twoState))).toThrow(
      /expected one vector register, got 2/,
    );
  });

  it('throws when an AES instruction has no register or the trace lacks a subkey', () => {
    const noRegister = toyListing();
    noRegister.instructions[2]!.operands = [];
    expect(() => deriveIsaFacets(bundle(), toyProfile(noRegister))).toThrow(
      /no destination register/,
    );
    const noSubkeys = bundle();
    const values = noSubkeys.facets['values@default'] as { values: { role: string }[] };
    values.values = values.values.filter((value) => value.role !== 'subkey');
    expect(() => deriveIsaFacets(noSubkeys, toyProfile())).toThrow(
      /no subkey value for round key 0/,
    );
  });

  it('throws on a bundle without the AES contract or a listing for its Nr', () => {
    expect(() => deriveIsaFacets(aesFixtureBundle('fips197-c2'), toyProfile())).toThrow(
      /12 rounds/,
    );
    const broken = bundle();
    (broken.facets['state@default'] as AnyStateFacet).steps.splice(0, 1);
    expect(() => deriveIsaFacets(broken, toyProfile())).toThrow(/no input step/);
  });
});

describe('listingRegisters', () => {
  it('lists the used vector registers by number at 128 bits', () => {
    expect(listingRegisters(toyProfile(), toyListing())).toEqual([
      { name: 'r0', bits: 128, lanes: [8, 32] },
      { name: 'r1', bits: 128, lanes: [8, 32] },
      { name: 'r3', bits: 128, lanes: [8, 32] },
    ]);
  });
});
