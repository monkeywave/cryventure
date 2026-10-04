import { describe, expect, it } from 'vitest';
import {
  annotateKeccakListing,
  laneIndex,
  piDestination,
  RHO_OFFSETS,
  vectorRegister,
} from './annotateKeccak.ts';
import { parseInstructionText, type ParsedInstruction } from './parse.ts';

function listing(lines: readonly string[]): (ParsedInstruction & { address: string })[] {
  return lines.map((line, index) => ({
    ...parseInstructionText(line)!,
    address: `0x${(index * 4).toString(16)}`,
  }));
}

const COLUMNS = [0, 1, 2, 3, 4];
const lane = (index: number) => `v${index}.16b`;
const parity = (x: number) => `v${30 + x}.16b`;
const d = (x: number) => `v${40 + x}.2d`;
const rho = (index: number) => `v${50 + index}.2d`;

/**
 * A textbook round the way the kernel is written: lanes in v0..v24, C in v30.., D in v40.., the
 * lanes after π in v50.. (by destination), χ back into v0..v24, RC in v80. `options` vary it.
 */
function round(options: { eorForLaneZero?: boolean; rhoOfLane1?: number } = {}): string[] {
  const parities = COLUMNS.flatMap((x) => [
    `eor3 ${parity(x)}, ${lane(x)}, ${lane(x + 5)}, ${lane(x + 10)}`,
    `eor3 ${parity(x)}, ${parity(x)}, ${lane(x + 15)}, ${lane(x + 20)}`,
  ]);
  const ds = COLUMNS.map(
    (x) => `rax1 ${d(x)}, v${30 + ((x + 4) % 5)}.2d, v${30 + ((x + 1) % 5)}.2d`,
  );
  const rhoPi = Array.from({ length: 25 }, (_, source) => {
    const x = source % 5;
    const y = Math.floor(source / 5);
    const offset =
      source === 1 && options.rhoOfLane1 !== undefined ? options.rhoOfLane1 : RHO_OFFSETS[x]![y]!;
    const destination = rho(piDestination(source));
    if (source === 0 && options.eorForLaneZero === true) return `eor v50.16b, ${lane(0)}, v40.16b`;
    return `xar ${destination}, v${source}.2d, ${d(x)}, #${(64 - offset) % 64}`;
  });
  const chi = Array.from({ length: 25 }, (_, index) => {
    const row = index - (index % 5);
    const next = (step: number) => `v${50 + row + ((index + step) % 5)}.16b`;
    return `bcax ${lane(index)}, v${50 + index}.16b, ${next(2)}, ${next(1)}`;
  });
  return [...parities, ...ds, ...rhoPi, ...chi, 'ldr d80, [x9, x8]', 'eor v0.16b, v80.16b, v0.16b'];
}

const PROLOGUE = [
  'sub sp, sp, #16',
  'mov x8, xzr',
  'adrp x9, RC',
  ...Array.from({ length: 25 }, (_, index) => `ldr d${index}, [x0, #${index * 8}]`),
];
const LOOP_END = ['add x8, x8, #8', 'cmp x8, #192', 'b.ne .LBB0_1'];
const EPILOGUE = ['zip1 v90.2d, v0.2d, v1.2d', 'stp q90, q91, [x0]', 'str d24, [x0, #192]', 'ret'];

function program(body: readonly string[]) {
  const lines = [...PROLOGUE, ...body, ...LOOP_END, ...EPILOGUE];
  const loop = {
    firstIndex: PROLOGUE.length,
    lastIndex: PROLOGUE.length + body.length + LOOP_END.length - 1,
  };
  return { instructions: listing(lines), loop };
}

describe('laneIndex / piDestination', () => {
  it('maps (x, y) to x + 5y and moves lane (x, y) to (y, 2x + 3y)', () => {
    expect(laneIndex(3, 2)).toBe(13);
    expect(piDestination(0)).toBe(0);
    expect(piDestination(laneIndex(1, 0))).toBe(laneIndex(0, 2));
    expect(piDestination(laneIndex(0, 1))).toBe(laneIndex(1, 3));
    expect(new Set(Array.from({ length: 25 }, (_, index) => piDestination(index))).size).toBe(25);
  });
});

describe('vectorRegister', () => {
  it('canonicalises q, d and arrangement-suffixed v registers; not integer registers', () => {
    expect(['q3', 'd3', 'v3.2d', 'v3.16b'].map(vectorRegister)).toEqual(['v3', 'v3', 'v3', 'v3']);
    expect(['x8', 'sp', '#8'].map(vectorRegister)).toEqual([undefined, undefined, undefined]);
  });
});

describe('annotateKeccakListing', () => {
  it('labels prologue, a round body and epilogue with x, half and lane', () => {
    const { instructions, loop } = program(round());
    const annotated = annotateKeccakListing(instructions, loop);
    const roles = (role: string) => annotated.filter((entry) => entry.role === role);
    expect(annotated.slice(0, 3).map((entry) => entry.role)).toEqual(['other', 'loop', 'other']);
    expect(roles('loadState').map((entry) => entry.lane)).toEqual(
      Array.from({ length: 25 }, (_, i) => i),
    );
    expect(roles('thetaParity').map((entry) => [entry.x, entry.half])).toEqual(
      COLUMNS.flatMap((x) => [
        [x, 1],
        [x, 2],
      ]),
    );
    expect(roles('thetaD').map((entry) => entry.x)).toEqual(COLUMNS);
    expect(roles('thetaRhoPi').map((entry) => entry.lane)).toEqual(
      Array.from({ length: 25 }, (_, source) => piDestination(source)),
    );
    expect(roles('chi').map((entry) => entry.lane)).toEqual(
      Array.from({ length: 25 }, (_, i) => i),
    );
    expect(roles('loadRc')).toHaveLength(1);
    expect(roles('iota').map((entry) => entry.lane)).toEqual([0]);
    expect(roles('loop').map((entry) => entry.mnemonic)).toEqual(['mov', 'add', 'cmp', 'b.ne']);
    expect(roles('storeState').map((entry) => [entry.mnemonic, entry.lane])).toEqual([
      ['zip1', 0],
      ['stp', 0],
      ['str', 24],
    ]);
  });

  it('reads lane (0,0) through a plain eor when the compiler drops xar #0', () => {
    const { instructions, loop } = program(round({ eorForLaneZero: true }));
    const eor = annotateKeccakListing(instructions, loop).find(
      (entry) => entry.mnemonic === 'eor' && entry.operands[0] === 'v50.16b',
    );
    expect(eor).toMatchObject({ role: 'thetaRhoPi', lane: 0 });
  });

  it('follows a lane through a spill and a reload', () => {
    const body = round().map((line) =>
      line.startsWith('xar v74.2d, v21.2d') ? 'xar v74.2d, v99.2d, v41.2d, #62' : line,
    );
    const spilled = ['str q21, [sp]', 'ldr q99, [sp]', ...body];
    const { instructions, loop } = program(spilled);
    const annotated = annotateKeccakListing(instructions, loop);
    expect(
      annotated.filter((entry) => entry.operands.includes('[sp]')).map((entry) => entry.role),
    ).toEqual(['other', 'other']);
    expect(annotated.find((entry) => entry.operands[1] === 'v99.2d')).toMatchObject({
      role: 'thetaRhoPi',
      lane: piDestination(21),
    });
  });

  it('throws on a wrong rho offset', () => {
    const { instructions, loop } = program(round({ rhoOfLane1: 2 }));
    expect(() => annotateKeccakListing(instructions, loop)).toThrow(/wrong rho offset/);
  });

  it('throws on an xar without a rotation immediate', () => {
    const body = round().map((line) =>
      line.startsWith('xar v74.2d, v21.2d') ? 'xar v74.2d, v21.2d, v41.2d, x9' : line,
    );
    const { instructions, loop } = program(body);
    expect(() => annotateKeccakListing(instructions, loop)).toThrow(/"x9" is not an immediate/);
  });

  it('throws when the body does not hand the lanes back in the same registers', () => {
    const { instructions, loop } = program([...round(), 'mov v1.16b, v2.16b']);
    expect(() => annotateKeccakListing(instructions, loop)).toThrow(/register-lane mapping/);
  });

  it('throws on parity lanes from different columns', () => {
    const body = round().map((line, index) =>
      index === 0 ? 'eor3 v30.16b, v0.16b, v6.16b, v10.16b' : line,
    );
    const { instructions, loop } = program(body);
    expect(() => annotateKeccakListing(instructions, loop)).toThrow(/different columns/);
  });
});
