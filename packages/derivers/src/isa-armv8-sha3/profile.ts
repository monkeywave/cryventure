import type { I18nRef } from '@cryventure/core';
import { memoryOperand, registerOperand, VECTOR_128_LE } from '../_lib/isaFacets.ts';
import {
  NO_EFFECTS,
  requiredRound,
  roundSteps,
  type KeccakEffects,
  type KeccakIsaProfile,
  type KeccakMachine,
  type KeccakSemantics,
} from '../_lib/keccak/keccakDerivation.ts';
import { KECCAK_LANE_BYTES, laneIndex, laneXY, wrapColumn } from '../_lib/keccak/keccakTrace.ts';
import {
  expectValue,
  expectValueSet,
  lowHalf,
  roundInput,
  ZERO,
  type KeccakRegister,
  type KeccakValue,
} from '../_lib/keccak/keccakValues.ts';
import {
  armImmediate,
  armSimdRegister,
  type KeccakListing,
  type KeccakListingInstruction,
} from '../_lib/listing.ts';
import { operand, requiredMemOperand, vectorOperandReader } from '../_lib/sha/shaOperands.ts';
import keccak from './data/keccak.json';

/**
 * ARMv8.2 SHA3 (FEAT_SHA3; docs/M6.md §5, Arm ARM EOR3/RAX1/XAR/BCAX): what each instruction of the
 * Keccak-f[1600] listing does to the lanes. Every lane lives in the low half of its own vector
 * register (the `d` loads zero the high half, and the lane operations keep it zero).
 *
 * - `eor3 Vd, Vn, Vm, Va`: Vn ⊕ Vm ⊕ Va. θ's column parity C[x] takes two: rows 0–2 (`half` 1, the
 *   trace's `theta.partial[x]`), then that ⊕ rows 3, 4 (`half` 2, `theta.c[x]`).
 * - `rax1 Vd, Vn, Vm`: Vn ⊕ ROL(Vm, 1) = D[x] from C[x−1] and C[x+1].
 * - `xar Vd, Vn, Vm, #imm`: ROR(Vn ⊕ Vm, imm). With the lane and D[x] this is θ and ρ of one lane
 *   (imm = 64 − ρ offset); writing the result into the register of the lane's π destination is π.
 * - `bcax Vd, Vn, Vm, Va`: Vn ⊕ (Vm ∧ ¬Va), χ's B[x] ⊕ (¬B[x+1] ∧ B[x+2]) with Vm = B[x+2], Va = B[x+1].
 * - `eor` with the round constant: ι.
 */

const DERIVER_ID = 'isa-armv8-sha3';
const NS = `deriver.${DERIVER_ID}`;
const Q_BYTES = 16;

const register = vectorOperandReader(armSimdRegister, 'a vector register');

/** Bytes a `d` (8) or `q` (16) register operand moves. */
function accessBytes(instruction: KeccakListingInstruction, index: number): number {
  const text = operand(instruction, index);
  if (text.startsWith('d')) return KECCAK_LANE_BYTES;
  if (text.startsWith('q')) return Q_BYTES;
  throw new Error(`operand ${index} is neither a d nor a q register`);
}

/** The registers and memory accesses of a load/store of `count` registers (`ldr`/`str` 1, `ldp`/`stp` 2). */
function accesses(instruction: KeccakListingInstruction, count: number) {
  const address = requiredMemOperand(operand(instruction, count));
  const size = accessBytes(instruction, 0);
  return Array.from({ length: count }, (_, index) => {
    const offset = address.offset + index * size;
    return {
      reg: register(instruction, index),
      offset,
      size,
      memory: memoryOperand({ base: address.base, offset }, size),
    };
  });
}

/** The lane at byte `offset` of the state array A; throws unless it is the listing's `lane` + `index`. */
function laneAt(instruction: KeccakListingInstruction, offset: number, index: number): number {
  const lane = offset / KECCAK_LANE_BYTES;
  if (instruction.lane === undefined || instruction.lane + index !== lane)
    throw new Error(`[x0, #${offset}] is lane ${lane}, the listing says ${instruction.lane}`);
  return lane;
}

/** The low half of `content`; throws unless the high half is zero (a lane operation). */
function lowOf(content: KeccakRegister, name: string): KeccakValue {
  expectValue(content.high, ZERO, `${name}'s high half`);
  return content.low;
}

/** Destination and lane values of the register sources of `op vD, vN, …` (`count` registers in all). */
function laneOperands(
  instruction: KeccakListingInstruction,
  machine: KeccakMachine,
  count: number,
) {
  const names = Array.from({ length: count }, (_, index) => register(instruction, index));
  return {
    target: names[0]!,
    sources: names.slice(1).map((name) => lowOf(machine.registers.read(name), name)),
    reads: names.slice(1).map((name) => registerOperand(name)),
    writes: [registerOperand(names[0]!)],
  };
}

/** The effects of a lane operation that writes `value` into its destination. */
function laneResult(
  { target, reads, writes }: ReturnType<typeof laneOperands>,
  value: KeccakValue,
): KeccakEffects {
  return { reads, writes, written: [{ reg: target, content: lowHalf(value) }] };
}

/** The state after the permutation (what the epilogue stores), lane `lane`. */
const stateOut = (machine: KeccakMachine, lane: number): KeccakValue =>
  roundInput(machine.permutation, machine.permutation.rounds.length, lane);

/** `ldp dA, dB, [x0, #off]` / `ldr dA, [x0, #off]` (loadState): lanes of A into low halves. */
function loadLanes(count: number): KeccakSemantics {
  return (instruction, machine) => {
    const loaded = accesses(instruction, count);
    return {
      reads: loaded.map(({ memory }) => memory),
      writes: loaded.map(({ reg }) => registerOperand(reg)),
      written: loaded.map(({ reg, offset }, index) => ({
        reg,
        content: lowHalf(roundInput(machine.permutation, 0, laneAt(instruction, offset, index))),
      })),
    };
  };
}

/** `stp d15, d14, [sp, #16]`: saves the caller's callee-saved registers (values outside the trace). */
function saveCallerRegisters(instruction: KeccakListingInstruction): KeccakEffects {
  const saved = accesses(instruction, 2);
  return {
    reads: saved.map(({ reg }) => registerOperand(reg)),
    writes: saved.map(({ memory }) => memory),
    written: [],
  };
}

/** `ldp d9, d8, [sp, #64]`: restores the caller's registers; the trace does not know their values. */
function restoreCallerRegisters(instruction: KeccakListingInstruction): KeccakEffects {
  const restored = accesses(instruction, 2);
  return {
    reads: restored.map(({ memory }) => memory),
    writes: restored.map(({ reg }) => registerOperand(reg)),
    written: [],
    restored: restored.map(({ reg }) => reg),
  };
}

/** `str q26, [sp]`: spills a whole register to the stack. */
function spill(instruction: KeccakListingInstruction, machine: KeccakMachine): KeccakEffects {
  const [slot] = accesses(instruction, 1);
  const content = machine.registers.read(slot!.reg);
  return {
    reads: [registerOperand(slot!.reg)],
    writes: [slot!.memory],
    written: [],
    spilled: [{ offset: slot!.offset, content }],
  };
}

/** `ldr q27, [sp]`: reloads a spilled register, possibly into another one. */
function reload(instruction: KeccakListingInstruction, machine: KeccakMachine): KeccakEffects {
  const [slot] = accesses(instruction, 1);
  return {
    reads: [slot!.memory],
    writes: [registerOperand(slot!.reg)],
    written: [{ reg: slot!.reg, content: machine.registers.readStack(slot!.offset) }],
  };
}

/** `[x9, x8]`: the RC table (x9) at the round's byte offset (x8 = 8 · round). */
const RC_OPERAND = /^\[\s*(\w+)\s*,\s*(\w+)\s*\]$/;

/** `ldr d0, [x9, x8]` (loadRc): ι's round constant of this round into a low half. */
function loadRoundConstant(
  instruction: KeccakListingInstruction,
  machine: KeccakMachine,
): KeccakEffects {
  const round = requiredRound(machine);
  const base = RC_OPERAND.exec(operand(instruction, 1))?.[1];
  if (base === undefined) throw new Error('the RC load is not [table, offset]');
  const target = register(instruction, 0);
  const { iota } = roundSteps(machine);
  return {
    reads: [memoryOperand({ base, offset: round * KECCAK_LANE_BYTES }, KECCAK_LANE_BYTES)],
    writes: [registerOperand(target)],
    written: [{ reg: target, content: lowHalf({ kind: 'rc', step: iota.step }) }],
  };
}

/** `str d31, [x0, #192]` (storeState): one lane of the result back into A. */
function storeLane(instruction: KeccakListingInstruction, machine: KeccakMachine): KeccakEffects {
  const [stored] = accesses(instruction, 1);
  const lane = laneAt(instruction, stored!.offset, 0);
  expectValue(machine.registers.read(stored!.reg).low, stateOut(machine, lane), `${stored!.reg}`);
  return { reads: [registerOperand(stored!.reg)], writes: [stored!.memory], written: [] };
}

/** `stp qA, qB, [x0, #off]` (storeState): four lanes, two per register (paired by `zip1`). */
function storeLanePairs(
  instruction: KeccakListingInstruction,
  machine: KeccakMachine,
): KeccakEffects {
  const stored = accesses(instruction, 2);
  stored.forEach(({ reg, offset }, index) => {
    const first = laneAt(instruction, offset, 2 * index);
    const content = machine.registers.read(reg);
    expectValue(content.low, stateOut(machine, first), `${reg}'s low half`);
    expectValue(content.high, stateOut(machine, first + 1), `${reg}'s high half`);
  });
  return {
    reads: stored.map(({ reg }) => registerOperand(reg)),
    writes: stored.map(({ memory }) => memory),
    written: [],
  };
}

/** `zip1 vD.2d, vA.2d, vB.2d`: the low halves of A and B side by side (two lanes for a q store). */
function zipLow(instruction: KeccakListingInstruction, machine: KeccakMachine): KeccakEffects {
  const [target, a, b] = [0, 1, 2].map((index) => register(instruction, index)) as [
    string,
    string,
    string,
  ];
  const content = { low: machine.registers.read(a).low, high: machine.registers.read(b).low };
  if (instruction.role === 'storeState' && instruction.lane !== undefined) {
    expectValue(content.low, stateOut(machine, instruction.lane), `${a}`);
    expectValue(content.high, stateOut(machine, instruction.lane + 1), `${b}`);
  }
  return {
    reads: [registerOperand(a), registerOperand(b)],
    writes: [registerOperand(target)],
    written: [{ reg: target, content }],
  };
}

const isSimd = (text: string): boolean => armSimdRegister(text) !== undefined;

/** Scalar bookkeeping (stack pointer, loop counter, RC table address, branches): no vector lanes. */
function scalarOnly(instruction: KeccakListingInstruction): KeccakEffects {
  if (instruction.operands.some(isSimd)) throw new Error('expected scalar operands only');
  return NO_EFFECTS;
}

/** `mov vD.16b, vN.16b`: a register copy (a scalar `mov` has no vector effect). */
function move(instruction: KeccakListingInstruction, machine: KeccakMachine): KeccakEffects {
  if (!instruction.operands.some(isSimd)) return scalarOnly(instruction);
  const [target, source] = [register(instruction, 0), register(instruction, 1)];
  return {
    reads: [registerOperand(source)],
    writes: [registerOperand(target)],
    written: [{ reg: target, content: machine.registers.read(source) }],
  };
}

function requiredField(value: number | undefined, field: string): number {
  if (value === undefined) throw new Error(`the listing gives no ${field}`);
  return value;
}

const thetaValue = (
  machine: KeccakMachine,
  part: 'partial' | 'c' | 'd',
  x: number,
): KeccakValue => ({
  kind: 'theta',
  step: roundSteps(machine).theta.step,
  part,
  x: wrapColumn(x),
});

/** Lane `lane` at the start of this round. */
const input = (machine: KeccakMachine, lane: number): KeccakValue =>
  roundInput(machine.permutation, requiredRound(machine), lane);

/** `eor3` (thetaParity): C[x] over rows 0–2 (`half` 1, theta.partial[x]) or the whole column (`half` 2, theta.c[x]). */
function parity(instruction: KeccakListingInstruction, machine: KeccakMachine): KeccakEffects {
  const x = requiredField(instruction.x, 'x');
  const lanes = laneOperands(instruction, machine, 4);
  const column = (y: number) => input(machine, laneIndex(x, y));
  const expected =
    instruction.half === 1
      ? [column(0), column(1), column(2)]
      : [thetaValue(machine, 'partial', x), column(3), column(4)];
  expectValueSet(lanes.sources, expected, `C[${x}] half ${instruction.half}`);
  return laneResult(lanes, thetaValue(machine, instruction.half === 1 ? 'partial' : 'c', x));
}

/** `rax1 Vd, Vn, Vm` (thetaD): D[x] = C[x−1] ⊕ ROL(C[x+1], 1). */
function thetaD(instruction: KeccakListingInstruction, machine: KeccakMachine): KeccakEffects {
  const x = requiredField(instruction.x, 'x');
  const lanes = laneOperands(instruction, machine, 3);
  expectValue(lanes.sources[0]!, thetaValue(machine, 'c', x - 1), `${register(instruction, 1)}`);
  expectValue(lanes.sources[1]!, thetaValue(machine, 'c', x + 1), `${register(instruction, 2)}`);
  return laneResult(lanes, thetaValue(machine, 'd', x));
}

/** The ρ-step value of the lane π moves to `lane` (FIPS 202: π's B[x, y] is the rotated A[x + 3y, x]). */
function rhoOf(machine: KeccakMachine, lane: number): KeccakValue {
  const { rho } = roundSteps(machine);
  return { kind: 'lane', step: rho.step, lane: machine.trace.piSource[lane]! };
}

/** The `#imm` of `xar`. */
const immediate = (instruction: KeccakListingInstruction): number =>
  armImmediate(operand(instruction, 3));

/**
 * `xar Vd, Vn, Vm, #imm` (thetaRhoPi): ROR(lane ⊕ D[x], imm) with imm = (64 − ρ offset) mod 64, the
 * source lane's ρ-step value, written to the register of its π destination `lane`.
 */
function thetaRhoPi(instruction: KeccakListingInstruction, machine: KeccakMachine): KeccakEffects {
  const lane = requiredField(instruction.lane, 'lane');
  const source = machine.trace.piSource[lane]!;
  const lanes = laneOperands(instruction, machine, 3);
  const expected = [input(machine, source), thetaValue(machine, 'd', laneXY(source).x)];
  expectValueSet(lanes.sources, expected, `lane ${source} and D`);
  const rotation = (64 - machine.trace.rhoOffsets[source]!) % 64;
  if (immediate(instruction) !== rotation)
    throw new Error(`lane ${source} needs a right rotation by ${rotation}`);
  return laneResult(lanes, rhoOf(machine, lane));
}

/** `bcax Vd, Vn, Vm, Va` (chi): B[x] ⊕ (Vm ∧ ¬Va) with Vm = B[x+2], Va = B[x+1] → the χ-step lane. */
function chi(instruction: KeccakListingInstruction, machine: KeccakMachine): KeccakEffects {
  const lane = requiredField(instruction.lane, 'lane');
  const { x, y } = laneXY(lane);
  const lanes = laneOperands(instruction, machine, 4);
  [0, 2, 1].forEach((dx, index) =>
    expectValue(
      lanes.sources[index]!,
      rhoOf(machine, laneIndex(x + dx, y)),
      `${register(instruction, index + 1)}`,
    ),
  );
  const { step } = roundSteps(machine).chi;
  return laneResult(lanes, { kind: 'lane', step, lane });
}

/** `eor vD, vN, vM` (iota): lane (0, 0) after χ ⊕ RC → the ι-step lane 0. */
function iota(instruction: KeccakListingInstruction, machine: KeccakMachine): KeccakEffects {
  if (instruction.role !== 'iota') throw new Error('only ι uses a plain eor');
  const { chi: chiStep, iota: iotaStep } = roundSteps(machine);
  const lanes = laneOperands(instruction, machine, 3);
  const expected: KeccakValue[] = [
    { kind: 'lane', step: chiStep.step, lane: 0 },
    { kind: 'rc', step: iotaStep.step },
  ];
  expectValueSet(lanes.sources, expected, 'lane 0 and RC');
  return laneResult(lanes, { kind: 'lane', step: iotaStep.step, lane: 0 });
}

/** Semantics that differ by role: lane loads/stores (state) or the caller's registers, spills and RC. */
const byRole =
  (cases: Partial<Record<KeccakListingInstruction['role'], KeccakSemantics>>): KeccakSemantics =>
  (instruction, machine) => {
    const semantics = cases[instruction.role];
    if (semantics === undefined) throw new Error(`no semantics for role ${instruction.role}`);
    return semantics(instruction, machine);
  };

const SEMANTICS: Readonly<Record<string, KeccakSemantics>> = {
  ldp: byRole({ loadState: loadLanes(2), other: restoreCallerRegisters }),
  ldr: byRole({ loadState: loadLanes(1), loadRc: loadRoundConstant, other: reload }),
  stp: byRole({ storeState: storeLanePairs, other: saveCallerRegisters }),
  str: byRole({ storeState: storeLane, other: spill }),
  zip1: zipLow,
  mov: move,
  eor3: parity,
  rax1: thetaD,
  xar: thetaRhoPi,
  bcax: chi,
  eor: iota,
  add: scalarOnly,
  sub: scalarOnly,
  cmp: scalarOnly,
  adrp: scalarOnly,
  'b.ne': scalarOnly,
  ret: scalarOnly,
};

/** The index of the first `bcax` (χ) of the loop body, or −1. */
function firstChi(instructions: readonly KeccakListingInstruction[]): number {
  return instructions.findIndex((instruction) => instruction.role === 'chi');
}

/** Notes of `xar`: the one without rotation (lane (0, 0)), and the one clang moved after χ began. */
function xarNote(instructions: readonly KeccakListingInstruction[], index: number): I18nRef {
  const instruction = instructions[index]!;
  if (index > firstChi(instructions)) return { key: `${NS}.note.xarLate` };
  if (immediate(instruction) === 0) return { key: `${NS}.note.xarNoRotation` };
  return { key: `${NS}.note.xar` };
}

const MNEMONIC_NOTES: Readonly<Record<string, string>> = {
  rax1: 'rax1',
  bcax: 'bcax',
  eor: 'iota',
  zip1: 'zip1',
  'b.ne': 'loop',
};

/** Notes on the roles whose instruction is not unique by mnemonic. */
function roleNote(instruction: KeccakListingInstruction): string | undefined {
  const { role, mnemonic } = instruction;
  if (role === 'thetaParity') return instruction.half === 1 ? 'parityPartial' : 'parity';
  if (role === 'loadRc') return 'loadRc';
  if (role === 'loadState') return 'loadState';
  if (role !== 'other') return undefined;
  if (mnemonic === 'str') return 'spill';
  if (mnemonic === 'ldr') return 'reload';
  if (mnemonic === 'stp') return 'calleeSave';
  if (mnemonic === 'ldp') return 'calleeRestore';
  return undefined;
}

/** The note on the instruction at `index` of the listing (`deriver.isa-armv8-sha3.note.*`). */
export function armSha3Note(
  instructions: readonly KeccakListingInstruction[],
  index: number,
): I18nRef | undefined {
  const instruction = instructions[index]!;
  if (instruction.mnemonic === 'xar') return xarNote(instructions, index);
  const name = roleNote(instruction) ?? MNEMONIC_NOTES[instruction.mnemonic];
  return name === undefined ? undefined : { key: `${NS}.note.${name}` };
}

/** The AArch64 ARMv8.2 SHA3 listing of Keccak-f[1600] and how to read it. */
export const ARMV8_SHA3_PROFILE: KeccakIsaProfile = {
  deriverId: DERIVER_ID,
  variant: 'aarch64-armv8-sha3',
  isa: 'aarch64',
  extension: 'armv8.2-sha3',
  syntax: 'arm',
  ...VECTOR_128_LE,
  listing: keccak as KeccakListing,
  vectorRegister: armSimdRegister,
  semantics: SEMANTICS,
  note: armSha3Note,
};
