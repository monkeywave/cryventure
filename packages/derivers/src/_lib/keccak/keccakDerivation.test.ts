import { describe, expect, it } from 'vitest';
import type { KeccakListing } from '../listing.ts';
import { keccakMachine, listedKeccak } from './fixtures/keccakChecks.ts';
import { keccakCovers, listingParts, requiredRound } from './keccakDerivation.ts';

const header = { compiler: 'c', flags: '', triple: 't', function: 'f', source: '' };

describe('listingParts', () => {
  it('splits a listing at the loop addresses', () => {
    const listing: KeccakListing = {
      ...header,
      loop: { first: '0x4', last: '0x8', iterations: 24 },
      instructions: ['0x0', '0x4', '0x8', '0xc'].map((address) => ({
        ...listedKeccak('ret', []),
        address,
      })),
    };
    const parts = listingParts(listing);
    expect(
      [parts.prologue, parts.body, parts.epilogue].map((part) => part.map((i) => i.address)),
    ).toEqual([['0x0'], ['0x4', '0x8'], ['0xc']]);
    expect(() => listingParts({ ...listing, loop: { ...listing.loop, last: '0x0' } })).toThrow(
      'no loop 0x4 … 0x0',
    );
  });
});

describe('keccakCovers', () => {
  const covers = (instruction: ReturnType<typeof listedKeccak>, round?: number) =>
    keccakCovers('d', instruction, keccakMachine({}, round));

  it('names the round and what an instruction produces, with lanes as (x, y)', () => {
    expect(covers(listedKeccak('eor3', [], 'thetaParity', { x: 1, half: 1 }), 3)).toEqual([
      { key: 'deriver.d.covers.parityPartial', params: { round: 3, x: 1 } },
    ]);
    expect(covers(listedKeccak('eor3', [], 'thetaParity', { x: 1, half: 2 }), 3)[0]!.key).toBe(
      'deriver.d.covers.parity',
    );
    expect(covers(listedKeccak('rax1', [], 'thetaD', { x: 4 }), 0)).toEqual([
      { key: 'deriver.d.covers.d', params: { round: 0, x: 4 } },
    ]);
    expect(covers(listedKeccak('xar', [], 'thetaRhoPi', { lane: 7 }), 0)).toEqual([
      { key: 'deriver.d.covers.thetaRhoPi', params: { round: 0, sx: 0, sy: 2, x: 2, y: 1 } },
    ]);
    expect(covers(listedKeccak('bcax', [], 'chi', { lane: 13 }), 0)).toEqual([
      { key: 'deriver.d.covers.chi', params: { round: 0, x: 3, y: 2 } },
    ]);
    expect(covers(listedKeccak('eor', [], 'iota'), 23)).toEqual([
      { key: 'deriver.d.covers.iota', params: { round: 23 } },
    ]);
    expect(covers(listedKeccak('ldr', [], 'loadRc'), 5)).toEqual([
      { key: 'deriver.d.covers.loadRc', params: { round: 5 } },
    ]);
  });

  it('gives no chips outside the loop or to bookkeeping', () => {
    expect(covers(listedKeccak('ldp', [], 'loadState', { lane: 0 }))).toEqual([]);
    expect(covers(listedKeccak('mov', [], 'other'), 0)).toEqual([]);
  });
});

describe('requiredRound', () => {
  it('throws outside the loop body', () => {
    expect(requiredRound({ round: 0 })).toBe(0);
    expect(() => requiredRound({ round: undefined })).toThrow('outside the loop body');
  });
});
