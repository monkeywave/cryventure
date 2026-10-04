import { describe, expect, it } from 'vitest';
import {
  deriveKeccakIsaFacets,
  listingParts,
  type KeccakIsaProfile,
} from '../_lib/keccak/keccakDerivation.ts';
import {
  sha3FixtureBundle,
  sharedSha3FixtureBundle,
} from '../_lib/keccak/fixtures/keccakBundles.ts';
import { keccakMachine, listedKeccak } from '../_lib/keccak/fixtures/keccakChecks.ts';
import { lowHalf, ZERO, type KeccakValue } from '../_lib/keccak/keccakValues.ts';
import type { KeccakListing } from '../_lib/listing.ts';
import { armSha3Note, armSimdRegister, ARMV8_SHA3_PROFILE } from './profile.ts';

const { semantics, listing } = ARMV8_SHA3_PROFILE;
const run = (
  instruction: ReturnType<typeof listedKeccak>,
  machine: ReturnType<typeof keccakMachine>,
) => semantics[instruction.mnemonic]!(instruction, machine);

/** Synthetic steps (keccakChecks): round r has θ at 2 + 5r, ρ 3 + 5r, π 4 + 5r, χ 5 + 5r, ι 6 + 5r; entry 1, exit 122. */
const lane = (step: number, index: number): KeccakValue => ({ kind: 'lane', step, lane: index });
const theta = (part: 'partial' | 'c' | 'd', x: number, round = 0): KeccakValue => ({
  kind: 'theta',
  step: 2 + 5 * round,
  part,
  x,
});

describe('armSimdRegister', () => {
  it('names d, q and v operands by their v register', () => {
    expect(['d8', 'q8', 'v8.2d', 'v8.16b', 'x8', 'xzr', '#0'].map(armSimdRegister)).toEqual([
      'v8',
      'v8',
      'v8',
      'v8',
      undefined,
      undefined,
      undefined,
    ]);
  });
});

describe('the listing', () => {
  it('has a one-round loop body with 10 eor3, 5 rax1, 25 xar, 25 bcax and one ι eor', () => {
    const { prologue, body, epilogue } = listingParts(listing);
    expect([prologue.length, body.length, epilogue.length]).toEqual([21, 86, 25]);
    const count = (mnemonic: string) => body.filter((i) => i.mnemonic === mnemonic).length;
    expect(['eor3', 'rax1', 'xar', 'bcax', 'eor'].map(count)).toEqual([10, 5, 25, 25, 1]);
    expect(listing.loop.iterations).toBe(24);
  });

  it('has semantics for every mnemonic it uses', () => {
    expect(listing.instructions.filter((i) => semantics[i.mnemonic] === undefined)).toEqual([]);
  });
});

describe('ARMv8.2 SHA3 semantics', () => {
  it('eor3 half 1 takes rows 0–2 of a column in any order and writes θ partial', () => {
    const machine = keccakMachine(
      { v1: lowHalf(lane(1, 12)), v2: lowHalf(lane(1, 2)), v3: lowHalf(lane(1, 7)) },
      0,
    );
    const eor3 = listedKeccak('eor3', ['v9.16b', 'v1.16b', 'v2.16b', 'v3.16b'], 'thetaParity', {
      x: 2,
      half: 1,
    });
    expect(run(eor3, machine).written).toEqual([
      { reg: 'v9', content: lowHalf(theta('partial', 2)) },
    ]);
    const wrong = keccakMachine(
      { v1: lowHalf(lane(1, 12)), v2: lowHalf(lane(1, 2)), v3: lowHalf(lane(1, 17)) },
      0,
    );
    expect(() => run(eor3, wrong)).toThrow('C[2] half 1');
  });

  it('eor3 half 2 adds rows 3 and 4 (after χ of the previous round) to the partial value', () => {
    const machine = keccakMachine(
      { v1: lowHalf(theta('partial', 0, 1)), v2: lowHalf(lane(5, 15)), v3: lowHalf(lane(5, 20)) },
      1,
    );
    const eor3 = listedKeccak('eor3', ['v9.16b', 'v1.16b', 'v2.16b', 'v3.16b'], 'thetaParity', {
      x: 0,
      half: 2,
    });
    expect(run(eor3, machine).written[0]!.content).toEqual(lowHalf(theta('c', 0, 1)));
  });

  it('rax1 needs C[x−1] then C[x+1] (rotated) and writes D[x]', () => {
    const rax1 = listedKeccak('rax1', ['v14.2d', 'v10.2d', 'v9.2d'], 'thetaD', { x: 0 });
    const machine = keccakMachine({ v10: lowHalf(theta('c', 4)), v9: lowHalf(theta('c', 1)) }, 0);
    expect(run(rax1, machine).written[0]!.content).toEqual(lowHalf(theta('d', 0)));
    const swapped = keccakMachine({ v10: lowHalf(theta('c', 1)), v9: lowHalf(theta('c', 4)) }, 0);
    expect(() => run(rax1, swapped)).toThrow('v10');
  });

  it('xar writes the ρ value of the π source lane and checks the rotation against the ρ offset', () => {
    // Destination lane 7 = (2, 1) holds what lane 10 = (0, 2) held; ρ offset of lane 10 is 3 → ror 61.
    const machine = keccakMachine({ v19: lowHalf(lane(1, 10)), v14: lowHalf(theta('d', 0)) }, 0);
    const xar = (imm: number) =>
      listedKeccak('xar', ['v19.2d', 'v19.2d', 'v14.2d', `#${imm}`], 'thetaRhoPi', { lane: 7 });
    expect(run(xar(61), machine).written[0]!.content).toEqual(lowHalf(lane(3, 10)));
    expect(() => run(xar(3), machine)).toThrow('right rotation by 61');
  });

  it('bcax needs B[x], B[x+2], B[x+1] in that order and writes the χ lane', () => {
    // χ of lane 0: Vn = B[0,0] (ρ lane 0), Vm = B[2,0] (ρ lane 12), Va = B[1,0] (ρ lane 6).
    const bcax = listedKeccak('bcax', ['v10.16b', 'v8.16b', 'v17.16b', 'v5.16b'], 'chi', {
      lane: 0,
    });
    const contents = {
      v8: lowHalf(lane(3, 0)),
      v17: lowHalf(lane(3, 12)),
      v5: lowHalf(lane(3, 6)),
    };
    expect(run(bcax, keccakMachine(contents, 0)).written[0]!.content).toEqual(lowHalf(lane(5, 0)));
    const swapped = { ...contents, v17: contents.v5, v5: contents.v17 };
    expect(() => run(bcax, keccakMachine(swapped, 0))).toThrow('v17');
  });

  it('ι: the RC load reads the table at 8 · round, eor gives the ι lane 0', () => {
    const ldr = listedKeccak('ldr', ['d0', '[x9, x8]'], 'loadRc');
    const effects = run(ldr, keccakMachine({}, 3));
    expect(effects.reads).toEqual([{ kind: 'mem', base: 'x9', offset: 24, size: 8 }]);
    expect(effects.written[0]!.content).toEqual(lowHalf({ kind: 'rc', step: 21 }));
    const eor = listedKeccak('eor', ['v8.16b', 'v0.16b', 'v10.16b'], 'iota', { lane: 0 });
    const machine = keccakMachine(
      { v0: lowHalf({ kind: 'rc', step: 21 }), v10: lowHalf(lane(20, 0)) },
      3,
    );
    expect(run(eor, machine).written[0]!.content).toEqual(lowHalf(lane(21, 0)));
    expect(() => run({ ...eor, role: 'other' }, machine)).toThrow('only ι');
  });

  it('spills a register to the stack and reloads it into another one', () => {
    const content = lowHalf(lane(1, 21));
    const spill = run(listedKeccak('str', ['q26', '[sp]']), keccakMachine({ v26: content }));
    expect(spill.spilled).toEqual([{ offset: 0, content }]);
    expect(spill.writes).toEqual([{ kind: 'mem', base: 'sp', offset: 0, size: 16 }]);
    const reload = run(listedKeccak('ldr', ['q27', '[sp]']), keccakMachine({}, 0, { 0: content }));
    expect(reload.written).toEqual([{ reg: 'v27', content }]);
  });

  it('loads lanes of A from the permutation entry and checks them against the listing', () => {
    const ldp = listedKeccak('ldp', ['d14', 'd2', '[x0, #16]'], 'loadState', { lane: 2 });
    expect(run(ldp, keccakMachine({})).written).toEqual([
      { reg: 'v14', content: lowHalf(lane(1, 2)) },
      { reg: 'v2', content: lowHalf(lane(1, 3)) },
    ]);
    expect(() => run({ ...ldp, lane: 3 }, keccakMachine({}))).toThrow('lane 2');
  });

  it('stores pairs zipped into q registers: the state after round 23', () => {
    const zip = listedKeccak('zip1', ['v0.2d', 'v8.2d', 'v11.2d'], 'storeState', { lane: 0 });
    const machine = keccakMachine({ v8: lowHalf(lane(121, 0)), v11: lowHalf(lane(120, 1)) });
    expect(run(zip, machine).written[0]!.content).toEqual({
      low: lane(121, 0),
      high: lane(120, 1),
    });
    const stale = keccakMachine({ v8: lowHalf(lane(6, 0)), v11: lowHalf(lane(120, 1)) });
    expect(() => run(zip, stale)).toThrow('v8');
  });

  it('marks the restored callee-saved registers as unknown, and rejects vector operands in scalar ops', () => {
    const restore = run(listedKeccak('ldp', ['d9', 'd8', '[sp, #64]']), keccakMachine({}));
    expect(restore).toMatchObject({ written: [], restored: ['v9', 'v8'] });
    expect(run(listedKeccak('add', ['x8', 'x8', '#8'], 'loop'), keccakMachine({}))).toMatchObject({
      written: [],
    });
    expect(() => run(listedKeccak('add', ['v1.2d', 'v1.2d', 'v2.2d']), keccakMachine({}))).toThrow(
      'scalar',
    );
  });

  it('rejects a lane operation on a register with a non-zero high half', () => {
    const rax1 = listedKeccak('rax1', ['v14.2d', 'v10.2d', 'v9.2d'], 'thetaD', { x: 0 });
    const machine = keccakMachine(
      { v10: { low: theta('c', 4), high: lane(1, 0) }, v9: lowHalf(theta('c', 1)) },
      0,
    );
    expect(() => run(rax1, machine)).toThrow("v10's high half");
    expect(ZERO).toEqual({ kind: 'zero' });
  });
});

describe('armSha3Note', () => {
  const noteAt = (address: string) => {
    const index = listing.instructions.findIndex((i) => i.address === address);
    return armSha3Note(listing.instructions, index)?.key.replace(
      'deriver.isa-armv8-sha3.note.',
      '',
    );
  };

  it('explains each kind of instruction, the late xar and the spill', () => {
    const notes = [
      '0x54',
      '0x78',
      '0x9c',
      '0xb8',
      '0xbc',
      '0x124',
      '0x11c',
      '0x144',
      '0x1a4',
      '0x1a8',
      '0x5c',
      '0x10c',
      '0x4',
      '0x1c8',
      '0x1ac',
      '0x8',
      '0x60',
      '0x10',
    ].map(noteAt);
    expect(notes).toEqual([
      'parityPartial',
      'parity',
      'rax1',
      'xarNoRotation',
      'xar',
      'xarLate',
      'bcax',
      'loadRc',
      'iota',
      'loop',
      'spill',
      'reload',
      'calleeSave',
      'calleeRestore',
      'zip1',
      'loadState',
      undefined,
      undefined,
    ]);
  });
});

describe('deriveKeccakIsaFacets with this profile', () => {
  it('rejects a listing whose loop runs a different number of rounds than the trace', () => {
    const profile: KeccakIsaProfile = {
      ...ARMV8_SHA3_PROFILE,
      listing: {
        ...ARMV8_SHA3_PROFILE.listing,
        loop: { ...ARMV8_SHA3_PROFILE.listing.loop, iterations: 12 },
      },
    };
    expect(() => deriveKeccakIsaFacets(sharedSha3FixtureBundle('sha3-256-abc'), profile)).toThrow(
      'the loop runs 12 rounds, the trace has 24',
    );
  });

  it('names the listed instruction when its semantics are missing or its inputs are not what the trace says', () => {
    const { eor3: _eor3, ...rest } = ARMV8_SHA3_PROFILE.semantics;
    const missing = { ...ARMV8_SHA3_PROFILE, semantics: rest };
    expect(() => deriveKeccakIsaFacets(sharedSha3FixtureBundle('sha3-256-abc'), missing)).toThrow(
      'listing 0x54 eor3: no semantics for this mnemonic',
    );
    const bundle = sha3FixtureBundle('sha3-256-abc');
    const listing = JSON.parse(JSON.stringify(ARMV8_SHA3_PROFILE.listing)) as KeccakListing;
    listing.instructions.find((instruction) => instruction.address === '0xbc')!.lane = 8;
    expect(() => deriveKeccakIsaFacets(bundle, { ...ARMV8_SHA3_PROFILE, listing })).toThrow(
      'listing 0xbc xar: lane 16 and D',
    );
  });
});
