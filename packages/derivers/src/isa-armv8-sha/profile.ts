import type { I18nRef } from '@cryventure/core';
import { armVectorRegister, memoryOperand, registerOperand } from '../_lib/isaFacets.ts';
import type { ShaListing, ShaListingInstruction } from '../_lib/listing.ts';
import {
  scheduleAheadNote,
  SHA256_VECTOR_DEFAULTS,
  type ShaEffects,
  type ShaIsaProfile,
  type ShaMachine,
  type ShaSemantics,
} from '../_lib/sha/shaDerivation.ts';
import {
  NO_EFFECTS,
  operand,
  requiredMemOperand,
  scheduleP1,
  scheduleWord,
  vectorOperandReader,
  written,
} from '../_lib/sha/shaOperands.ts';
import { expectLanes } from '../_lib/sha/shaRegisters.ts';
import { isRoundInstruction, requiredShaRound } from '../_lib/sha/shaSpans.ts';
import type { ShaVarName } from '../_lib/sha/shaTrace.ts';
import {
  blockInputLanes,
  byteSwapLanes,
  hLanes,
  laneRun,
  sumLanes,
  varLanes,
  word,
  type Lanes,
} from '../_lib/sha/shaWords.ts';
import sha256 from './data/sha256.json';

/**
 * ARMv8 SHA2 (FEAT_SHA256; docs/M5.md §5, Arm ARM SHA256H/SHA256H2/SHA256SU0/SHA256SU1): what each
 * instruction of the listing does to the lane words. Lane 0 is the least significant word.
 * `sha256h Qd, Qn, Vm.4S` reads A…D from Qd, E…H from Qn and K+W of rounds t … t+3 from Vm and
 * writes A…D after round t+3 into Qd; `sha256h2 Qd, Qn, Vm.4S` reads E…H from Qd and the **old**
 * A…D from Qn and writes E…H after round t+3. So ABCD is lanes [A, B, C, D], EFGH [E, F, G, H].
 */

export const DERIVER_ID = 'isa-armv8-sha';
export const NS = `deriver.${DERIVER_ID}`;
const ABCD = ['a', 'b', 'c', 'd'] as const;
const EFGH = ['e', 'f', 'g', 'h'] as const;
export const VECTOR_BYTES = 16;

/**
 * A literal-pool operand, `[x8, :lo12:.LCPI0_3]`. Its label is the compiler's numbering, so which
 * round constants it holds is read from the dataflow instead (`literalRound`).
 */
export const LITERAL = /\[\s*\w+\s*,\s*:lo12:\s*\.?LCPI\d+_\d+\s*\]/;

export const register = vectorOperandReader(armVectorRegister, 'a vector register');

/** Words per 16-byte vector register for the machine's word size (4 or 2). */
export const wordsPerVector = (machine: Pick<ShaMachine, 'wordBytes'>): number =>
  VECTOR_BYTES / machine.wordBytes;

/** The 16-byte access `index` (0, 1 for a pair) at `[base, #offset]`, and its first word index. */
export function memoryAccess(text: string, index: number, wordBytes: number, valueRef?: string) {
  const parsed = requiredMemOperand(text);
  const offset = parsed.offset + index * VECTOR_BYTES;
  return {
    ref: memoryOperand({ base: parsed.base, offset }, VECTOR_BYTES, valueRef),
    firstWord: offset / wordBytes,
  };
}

/** The vector registers of a pair instruction (`ldp`/`stp qA, qB, [...]`) and their memory accesses. */
function pairAccesses(
  instruction: ShaListingInstruction,
  machine: ShaMachine,
  valueRef: string | undefined,
) {
  const address = operand(instruction, 2);
  return [0, 1].map((index) => ({
    reg: register(instruction, index),
    ...memoryAccess(address, index, machine.wordBytes, valueRef),
  }));
}

/** `ldp qA, qB, [base, #off]`: two 16-byte loads of state words or block bytes. */
export function loadPair(instruction: ShaListingInstruction, machine: ShaMachine): ShaEffects {
  const valueRef = instruction.role === 'loadState' ? machine.chainIn : undefined;
  const accesses = pairAccesses(instruction, machine, valueRef);
  return {
    reads: accesses.map(({ ref }) => ref),
    writes: accesses.map(({ reg }) => registerOperand(reg)),
    written: accesses.map(({ reg, firstWord }) => ({
      reg,
      lanes: blockInputLanes(instruction.role, firstWord, wordsPerVector(machine)),
    })),
  };
}

/** `stp qA, qB, [base, #off]`: stores H, word by word, into the chaining value. */
export function storePair(instruction: ShaListingInstruction, machine: ShaMachine): ShaEffects {
  const accesses = pairAccesses(instruction, machine, machine.chainOut);
  accesses.forEach(({ reg, firstWord }) =>
    expectLanes(
      machine.registers.read(reg),
      hLanes(firstWord, wordsPerVector(machine)),
      `${reg} must hold H`,
    ),
  );
  return {
    reads: accesses.map(({ reg }) => registerOperand(reg)),
    writes: accesses.map(({ ref }) => ref),
    written: [],
  };
}

/** The first instruction after `index` that names the register instruction `index` writes, and where. */
function nextUseOfResult(
  instructions: readonly ShaListingInstruction[],
  index: number,
): { at: number; instruction: ShaListingInstruction } | undefined {
  const reg = armVectorRegister(instructions[index]?.operands[0] ?? '');
  const at = instructions.findIndex(
    (next, position) =>
      position > index && next.operands.some((text) => armVectorRegister(text) === reg),
  );
  return reg === undefined || at === -1 ? undefined : { at, instruction: instructions[at]! };
}

/**
 * The first round t whose constants K_t … K_{t+3} the literal load at `index` holds: its register
 * feeds an `add` (K + W) whose sum is the K+W operand of a round instruction running rounds t … t+3.
 * Read from the dataflow (loads run several rounds ahead), never from the pool label's number.
 */
function literalRound(
  instructions: readonly ShaListingInstruction[],
  index: number,
): number | undefined {
  const add = nextUseOfResult(instructions, index);
  if (add?.instruction.mnemonic !== 'add') return undefined;
  const consumer = nextUseOfResult(instructions, add.at)?.instruction;
  const sum = armVectorRegister(add.instruction.operands[0] ?? '');
  const feedsRound =
    consumer !== undefined &&
    isRoundInstruction(consumer) &&
    armVectorRegister(consumer.operands[2] ?? '') === sum;
  return feedsRound ? consumer.round : undefined;
}

/** `ldr qN, [x8, :lo12:.LCPI0_n]`: four round constants from the literal pool (a constant, no traced read). */
function loadLiteral(instruction: ShaListingInstruction, machine: ShaMachine): ShaEffects {
  const target = register(instruction, 0);
  if (!LITERAL.test(operand(instruction, 1)) || instruction.role !== 'addK')
    throw new Error('only round-constant literals are loaded with ldr');
  const t = literalRound(machine.listing, machine.index);
  if (t === undefined)
    throw new Error(`the round constants in ${target} feed no round instruction through an add`);
  return {
    reads: [],
    writes: [registerOperand(target)],
    written: written(target, laneRun(word.k, t)),
  };
}

/** `mov vD.16b, vN.16b`: a register copy. */
export function move(instruction: ShaListingInstruction, machine: ShaMachine): ShaEffects {
  const [target, source] = [register(instruction, 0), register(instruction, 1)];
  return {
    reads: [registerOperand(source)],
    writes: [registerOperand(target)],
    written: written(target, machine.registers.read(source)),
  };
}

/** Destination and register sources of a vector instruction (`op vD, vN[, vM]`). */
export function vectorOperands(
  instruction: ShaListingInstruction,
  machine: ShaMachine,
  count: number,
) {
  const names = Array.from({ length: count }, (_, index) => register(instruction, index));
  return {
    target: names[0]!,
    sources: names.map((name) => machine.registers.read(name)),
    reads: names.map((name) => registerOperand(name)),
    writes: [registerOperand(names[0]!)],
  };
}

/** `rev32 vD.16b, vN.16b` (`rev64` for 64-bit words): reverses the bytes of each word, W_t's bytes ↔ W_t. */
export function byteSwap(instruction: ShaListingInstruction, machine: ShaMachine): ShaEffects {
  const target = register(instruction, 0);
  const source = register(instruction, 1);
  return {
    reads: [registerOperand(source)],
    writes: [registerOperand(target)],
    written: written(target, byteSwapLanes(machine.registers.read(source), source)),
  };
}

/** `add vD.4s, vN.4s, vM.4s`: lane sums the trace records (K+W, the feed-forward). */
export function addWords(instruction: ShaListingInstruction, machine: ShaMachine): ShaEffects {
  const target = register(instruction, 0);
  const [left, right] = [register(instruction, 1), register(instruction, 2)];
  const lanes = sumLanes(
    machine.registers.read(left),
    machine.registers.read(right),
    machine.rounds,
  );
  return {
    reads: [registerOperand(left), registerOperand(right)],
    writes: [registerOperand(target)],
    written: written(target, lanes),
  };
}

/** K+W of rounds t … t+3 in `Vm` (operand 2) of a round instruction. */
function expectRoundInput(instruction: ShaListingInstruction, wk: Lanes, t: number): void {
  expectLanes(
    wk,
    laneRun(word.kw, t),
    `${register(instruction, 2)} must hold K+W of rounds ${t}…${t + 3}`,
  );
}

/** Four working variables a round instruction reads in a register, and how errors name them. */
interface RoundHalf {
  names: readonly ShaVarName[];
  label: string;
}

const ABCD_HALF: RoundHalf = { names: ABCD, label: 'A…D' };
const EFGH_HALF: RoundHalf = { names: EFGH, label: 'E…H' };
const OLD_ABCD_HALF: RoundHalf = { names: ABCD, label: 'the old A…D' };

/**
 * `sha256h Qd, Qn, Vm.4S` (own = A…D, other = E…H) and `sha256h2 Qd, Qn, Vm.4S` (own = E…H, other =
 * the old A…D): rounds t … t+3; Qd = `own` in and out, Qn = `other`.
 */
function fourRounds(own: RoundHalf, other: RoundHalf): ShaSemantics {
  return (instruction, machine) => {
    const { target, sources, reads, writes } = vectorOperands(instruction, machine, 3);
    const [ownLanes, otherLanes, wk] = sources as [Lanes, Lanes, Lanes];
    const t = requiredShaRound(instruction);
    expectLanes(
      ownLanes,
      varLanes(own.names, t - 1),
      `${target} must hold ${own.label} before round ${t}`,
    );
    expectLanes(
      otherLanes,
      varLanes(other.names, t - 1),
      `${register(instruction, 1)} must hold ${other.label} before round ${t}`,
    );
    expectRoundInput(instruction, wk, t);
    return { reads, writes, written: written(target, varLanes(own.names, t + 3)) };
  };
}

/** `sha256su0 Vd.4S, Vn.4S`: lane i ← W_{s−16+i} + σ0(W_{s−15+i}) = p1 of W_{s+i}. */
function scheduleUpdate0(instruction: ShaListingInstruction, machine: ShaMachine): ShaEffects {
  const { target, sources, reads, writes } = vectorOperands(instruction, machine, 2);
  const [before, other] = sources as [Lanes, Lanes];
  const source = register(instruction, 1);
  return scheduleP1(instruction, { target, source, before, other, reads, writes });
}

/**
 * `sha256su1 Vd.4S, Vn.4S, Vm.4S`: lane i ← p1 of W_{s+i} + W_{s+i−7} + σ1(W_{s+i−2}) = W_{s+i}
 * (Arm ARM: W_{s−7} … from Vn lanes 1–3 and Vm lane 0, σ1 of Vm lanes 2, 3 and then of its own lanes 0, 1).
 */
function scheduleUpdate1(instruction: ShaListingInstruction, machine: ShaMachine): ShaEffects {
  const { target, sources, reads, writes } = vectorOperands(instruction, machine, 3);
  const [partial, middle, recent] = sources as [Lanes, Lanes, Lanes];
  const s = scheduleWord(instruction);
  const [vn, vm] = [register(instruction, 1), register(instruction, 2)];
  expectLanes(partial, laneRun(word.p1, s), `${target} must hold p1 of W${s}…W${s + 3}`);
  expectLanes(
    middle,
    [undefined, word.w(s - 7), word.w(s - 6), word.w(s - 5)],
    `${vn} must hold W${s - 7}…W${s - 5} in lanes 1–3`,
  );
  expectLanes(
    recent,
    [word.w(s - 4), undefined, word.w(s - 2), word.w(s - 1)],
    `${vm} must hold W${s - 4} in lane 0 and W${s - 2}, W${s - 1} in lanes 2, 3`,
  );
  return { reads, writes, written: written(target, laneRun(word.w, s)) };
}

const SEMANTICS: Readonly<Record<string, ShaSemantics>> = {
  ldp: loadPair,
  stp: storePair,
  ldr: loadLiteral,
  /** The literal pool's page address in a scalar register (no vector lanes). */
  adrp: () => NO_EFFECTS,
  mov: move,
  rev32: byteSwap,
  add: addWords,
  sha256h: fourRounds(ABCD_HALF, EFGH_HALF),
  sha256h2: fourRounds(EFGH_HALF, OLD_ABCD_HALF),
  sha256su0: scheduleUpdate0,
  sha256su1: scheduleUpdate1,
  ret: () => NO_EFFECTS,
};

/** The next round instruction after `index` that writes register `target`, if any. */
function nextRoundWriting(
  instructions: readonly ShaListingInstruction[],
  index: number,
  target: string,
): ShaListingInstruction | undefined {
  return instructions
    .slice(index + 1)
    .find(
      (next) => isRoundInstruction(next) && armVectorRegister(next.operands[0] ?? '') === target,
    );
}

/** A `mov` that sets up the destination of the next `sha256h` (the ABCD copy) or `sha256h2` (the EFGH copy). */
function copyNote(
  instructions: readonly ShaListingInstruction[],
  index: number,
): I18nRef | undefined {
  const target = armVectorRegister(instructions[index]!.operands[0] ?? '');
  if (target === undefined) return undefined;
  const consumer = nextRoundWriting(instructions, index, target);
  if (consumer?.mnemonic === 'sha256h') return { key: `${NS}.note.copyAbcd` };
  if (consumer?.mnemonic === 'sha256h2') return { key: `${NS}.note.copyEfgh` };
  return undefined;
}

/**
 * Notes: the two halves of a four-round step, the copy of A…D that sha256h2 needs because sha256h
 * overwrites its input, round constants from the literal pool, and the schedule running ahead of the
 * rounds (the sliding window).
 */
export function armShaNote(
  instructions: readonly ShaListingInstruction[],
  index: number,
): I18nRef | undefined {
  const instruction = instructions[index]!;
  if (instruction.mnemonic === 'sha256h') return { key: `${NS}.note.sha256h` };
  if (instruction.mnemonic === 'sha256h2') return { key: `${NS}.note.sha256h2` };
  if (instruction.mnemonic === 'mov') return copyNote(instructions, index);
  if (instruction.role === 'msg1' || instruction.role === 'msg2')
    return scheduleAheadNote(DERIVER_ID, instruction);
  if (instruction.mnemonic === 'ldr') {
    const t = literalRound(instructions, index);
    return t === undefined
      ? undefined
      : { key: `${NS}.note.literalK`, params: { first: t, last: t + 3 } };
  }
  return undefined;
}

/** The AArch64 ARMv8 SHA2 listing of one SHA-256 compression and how to read it. */
export const ARMV8_SHA_PROFILE: ShaIsaProfile = {
  ...SHA256_VECTOR_DEFAULTS,
  deriverId: DERIVER_ID,
  variant: 'aarch64-armv8-sha2',
  isa: 'aarch64',
  extension: 'armv8-sha2',
  syntax: 'arm',
  listing: sha256 as ShaListing,
  roundsPerInstruction: 4,
  vectorRegister: armVectorRegister,
  semantics: SEMANTICS,
  note: armShaNote,
};
