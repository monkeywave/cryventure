import type { InstructionsFacet, RegistersFacet } from '@cryventure/core';
import { describe, expect, it } from 'vitest';
import type { ShaListingInstruction } from '../listing.ts';
import { sharedShaFixtureBundle } from './fixtures/shaBundles.ts';
import {
  deriveShaIsaFacets,
  scheduleAheadNote,
  shaCovers,
  shaExecute,
  type ShaIsaProfile,
  type ShaSemantics,
} from './shaDerivation.ts';
import { laneRun, varLanes, word } from './shaWords.ts';

const listed = (
  instruction: Partial<ShaListingInstruction> & Pick<ShaListingInstruction, 'role'>,
): ShaListingInstruction => ({
  address: '0x0',
  mnemonic: instruction.role,
  operands: [],
  ...instruction,
});

/** A toy ISA (mnemonic = role): `loadState v0` (H), `rounds v0, v1` (4 rounds, K+W in v1), `store v0`, all run by `execute`. */
function toyProfile(execute: ShaSemantics): ShaIsaProfile {
  const instructions: ShaListingInstruction[] = [
    listed({ role: 'loadState', operands: ['v0'] }),
    ...Array.from({ length: 16 }, (_, group) =>
      listed({ role: 'rounds', operands: ['v0', 'v1'], round: 4 * group }),
    ),
    listed({ role: 'store', operands: ['v0'] }),
  ];
  return {
    deriverId: 'toy',
    variant: 'toy',
    isa: 'toy',
    extension: 'toy',
    syntax: 'arm',
    byteOrder: 'little',
    lanes: [32],
    registerBits: 128,
    roundsPerInstruction: 4,
    listing: { compiler: 'c', flags: 'f', triple: 't', function: 'fn', source: '', instructions },
    vectorRegister: (operand) => (operand.startsWith('v') ? operand : undefined),
    semantics: { loadState: execute, rounds: execute, store: execute },
  };
}

const toyExecute: ShaSemantics = (instruction, machine) => {
  if (instruction.role === 'loadState')
    return {
      reads: [],
      writes: [],
      written: [
        { reg: 'v0', lanes: varLanes(['a', 'b', 'c', 'd'], -1), valueRef: machine.chainIn },
      ],
    };
  if (instruction.role === 'rounds')
    return {
      reads: [],
      writes: [],
      written: [
        { reg: 'v0', lanes: varLanes(['a', 'b', 'c', 'd'], instruction.round! + 3) },
        { reg: 'v1', lanes: laneRun(word.kw, instruction.round!) },
      ],
    };
  return { reads: [], writes: [], written: [] };
};

describe('deriveShaIsaFacets', () => {
  it('runs the listing once per block and renders every written register from the trace', () => {
    const bundle = sharedShaFixtureBundle('sha-256-two-block');
    const facets = deriveShaIsaFacets(bundle, toyProfile(toyExecute));
    const instructions = (facets['instructions@toy'] as InstructionsFacet).instructions;
    const registers = facets['registers@toy'] as RegistersFacet;
    expect(instructions).toHaveLength(2 * 18);
    expect(registers.file.registers.map((spec) => spec.name)).toEqual(['v0', 'v1']);
    expect(registers.steps[0]!.writes[0]).toMatchObject({ reg: 'v0', valueRef: 'iv' });
    expect(registers.steps[17]!.writes[0]).toMatchObject({ reg: 'v0', valueRef: 'h/1' });
    expect(instructions[1]!.covers).toEqual([
      { key: 'deriver.toy.covers.rounds', params: { first: 0, last: 3 } },
    ]);
    expect(instructions[0]!.note).toBeUndefined();
  });

  it('names the failing instruction when the profile finds unexpected register contents', () => {
    const profile = toyProfile(() => {
      throw new Error('v0 must hold ABCD');
    });
    expect(() => deriveShaIsaFacets(sharedShaFixtureBundle('sha-256-abc'), profile)).toThrow(
      'listing 0x0 loadState: v0 must hold ABCD',
    );
  });
});

describe('shaExecute', () => {
  it('runs the semantics of the mnemonic and throws for a mnemonic the profile has none for', () => {
    const machine = {
      registers: { read: () => [] },
      nextRound: 0,
      chainIn: 'iv',
      chainOut: 'h/1',
      listing: [],
      index: 0,
    };
    expect(shaExecute(toyProfile(toyExecute), listed({ role: 'store' }), machine)).toEqual({
      reads: [],
      writes: [],
      written: [],
    });
    expect(() => shaExecute(toyProfile(toyExecute), listed({ role: 'msg1' }), machine)).toThrow(
      'no semantics for this mnemonic',
    );
  });
});

describe('scheduleAheadNote', () => {
  it('notes the schedule words of a message instruction, nothing for other instructions', () => {
    expect(scheduleAheadNote('d', listed({ role: 'msg1', w: 20 }))).toEqual({
      key: 'deriver.d.note.scheduleAhead',
      params: { first: 20, last: 23 },
    });
    expect(scheduleAheadNote('d', listed({ role: 'msg2' }))).toBeUndefined();
    expect(scheduleAheadNote('d', listed({ role: 'rounds', round: 0 }))).toBeUndefined();
  });
});

describe('shaCovers', () => {
  const profile = { deriverId: 'd', roundsPerInstruction: 2 };

  it('chips the rounds of a round instruction and the words of a message instruction', () => {
    expect(shaCovers(profile, listed({ role: 'rounds', round: 6 }))).toEqual([
      { key: 'deriver.d.covers.rounds', params: { first: 6, last: 7 } },
    ]);
    expect(shaCovers(profile, listed({ role: 'msg1', w: 20 }))).toEqual([
      { key: 'deriver.d.covers.msg1', params: { first: 20, last: 23 } },
    ]);
    expect(shaCovers(profile, listed({ role: 'msg2', w: 16 }))).toEqual([
      { key: 'deriver.d.covers.msg2', params: { first: 16, last: 19 } },
    ]);
  });

  it('gives no chips to helpers (a msg2-tagged palignr without w, loads, shuffles)', () => {
    expect(shaCovers(profile, listed({ role: 'msg2' }))).toEqual([]);
    expect(shaCovers(profile, listed({ role: 'addK' }))).toEqual([]);
  });
});
