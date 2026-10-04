import type { I18nRef, OperandRef } from '@cryventure/core';
import { registerOperand } from '../_lib/isaFacets.ts';
import { parseMemOperand, type ShaListing, type ShaListingInstruction } from '../_lib/listing.ts';
import type { ShaEffects, ShaIsaProfile, ShaMachine } from '../_lib/sha/shaDerivation.ts';
import { expectLanes } from '../_lib/sha/shaRegisters.ts';
import { isRoundInstruction, requiredShaRound } from '../_lib/sha/shaSpans.ts';
import { SHA_VAR_NAMES, SHA_WORD_BYTES } from '../_lib/sha/shaTrace.ts';
import {
  byteSwapped,
  laneRun,
  laneSum,
  varLanes,
  word,
  type Lanes,
  type ShaWord,
} from '../_lib/sha/shaWords.ts';
import sha256 from './data/sha256.json';

/**
 * ARMv8 SHA2 (FEAT_SHA256; docs/M5.md §5, Arm ARM SHA256H/SHA256H2/SHA256SU0/SHA256SU1): what each
 * instruction of the listing does to the lane words. Lane 0 is the least significant word.
 * `sha256h Qd, Qn, Vm.4S` reads A…D from Qd, E…H from Qn and K+W of rounds t … t+3 from Vm and
 * writes A…D after round t+3 into Qd; `sha256h2 Qd, Qn, Vm.4S` reads E…H from Qd and the **old**
 * A…D from Qn and writes E…H after round t+3. So ABCD is lanes [A, B, C, D], EFGH [E, F, G, H].
 */

const NS = 'deriver.isa-armv8-sha';
const ABCD = ['a', 'b', 'c', 'd'] as const;
const EFGH = ['e', 'f', 'g', 'h'] as const;
const VECTOR_BYTES = 16;
/** Words per 16-byte vector register. */
const VECTOR_WORDS = VECTOR_BYTES / SHA_WORD_BYTES;

/** `q1`, `v1.16b` and `v1.4s` name the same 128-bit register `v1`. */
const VECTOR = /^[qv](\d+)(?:\.\w+)?$/;
/** A literal-pool operand, `[x8, :lo12:.LCPI0_3]`: the n-th pool entry, K_{4n} … K_{4n+3}. */
const LITERAL = /\[\s*\w+\s*,\s*:lo12:\s*\.?LCPI\d+_(\d+)\s*\]/;

/** Canonical name `v<n>` of a vector operand, or `undefined`. */
export function armShaVectorRegister(operand: string): string | undefined {
  const match = VECTOR.exec(operand);
  return match === null ? undefined : `v${match[1]}`;
}

function operand(instruction: ShaListingInstruction, index: number): string {
  const text = instruction.operands[index];
  if (text === undefined) throw new Error(`no operand ${index}`);
  return text;
}

function register(instruction: ShaListingInstruction, index: number): string {
  const name = armShaVectorRegister(operand(instruction, index));
  if (name === undefined) throw new Error(`operand ${index} is not a vector register`);
  return name;
}

function laneAt(lanes: Lanes, index: number): ShaWord {
  const lane = lanes[index];
  if (lane === undefined) throw new Error(`no lane ${index}`);
  return lane;
}

function written(reg: string, lanes: Lanes): ShaEffects['written'] {
  return [{ reg, lanes }];
}

/** The 16-byte access `index` (0, 1 for a pair) at `[base, #offset]`, and its first word index. */
function memoryAccess(text: string, index: number, valueRef?: string) {
  const parsed = parseMemOperand(text);
  if (parsed === undefined) throw new Error(`"${text}" is not a memory operand`);
  const offset = parsed.offset + index * VECTOR_BYTES;
  const ref: OperandRef = { kind: 'mem', base: parsed.base, offset, size: VECTOR_BYTES };
  return {
    ref: valueRef === undefined ? ref : { ...ref, valueRef },
    firstWord: offset / SHA_WORD_BYTES,
  };
}

/** The lane words a 16-byte load of words `first` … brings in, by the listing's role. */
function loadedWords(instruction: ShaListingInstruction, first: number): Lanes {
  switch (instruction.role) {
    case 'loadState':
      return laneRun((index) => word.var(SHA_VAR_NAMES[index]!, -1), first);
    case 'loadBlock':
      return laneRun(word.wBytes, first);
    default:
      throw new Error(`no load semantics for role ${instruction.role}`);
  }
}

/** The vector registers of a pair instruction (`ldp`/`stp qA, qB, [...]`) and their memory accesses. */
function pairAccesses(instruction: ShaListingInstruction, valueRef: string | undefined) {
  const address = operand(instruction, 2);
  return [0, 1].map((index) => ({
    reg: register(instruction, index),
    ...memoryAccess(address, index, valueRef),
  }));
}

/** `ldp qA, qB, [base, #off]`: two 16-byte loads of state words or block bytes. */
function loadPair(instruction: ShaListingInstruction, machine: ShaMachine): ShaEffects {
  const valueRef = instruction.role === 'loadState' ? machine.chainIn : undefined;
  const accesses = pairAccesses(instruction, valueRef);
  return {
    reads: accesses.map(({ ref }) => ref),
    writes: accesses.map(({ reg }) => registerOperand(reg)),
    written: accesses.map(({ reg, firstWord }) => ({
      reg,
      lanes: loadedWords(instruction, firstWord),
    })),
  };
}

/** `stp qA, qB, [base, #off]`: stores H, word by word, into the chaining value. */
function storePair(instruction: ShaListingInstruction, machine: ShaMachine): ShaEffects {
  const accesses = pairAccesses(instruction, machine.chainOut);
  accesses.forEach(({ reg, firstWord }) =>
    expectLanes(
      machine.registers.read(reg),
      laneRun((index) => word.h(SHA_VAR_NAMES[index]!), firstWord),
      `${reg} must hold H`,
    ),
  );
  return {
    reads: accesses.map(({ reg }) => registerOperand(reg)),
    writes: accesses.map(({ ref }) => ref),
    written: [],
  };
}

/** The first round constant a literal-pool operand holds (entry n: K_{4n} … K_{4n+3}). */
function literalRound(text: string): number | undefined {
  const entry = LITERAL.exec(text)?.[1];
  return entry === undefined ? undefined : Number(entry) * VECTOR_WORDS;
}

/** `ldr qN, [x8, :lo12:.LCPI0_n]`: four round constants from the literal pool (a constant, no traced read). */
function loadLiteral(instruction: ShaListingInstruction): ShaEffects {
  const target = register(instruction, 0);
  const t = literalRound(operand(instruction, 1));
  if (t === undefined || instruction.role !== 'addK')
    throw new Error('only round-constant literals are loaded with ldr');
  return {
    reads: [],
    writes: [registerOperand(target)],
    written: written(target, laneRun(word.k, t)),
  };
}

/** `mov vD.16b, vN.16b`: a register copy. */
function move(instruction: ShaListingInstruction, machine: ShaMachine): ShaEffects {
  const [target, source] = [register(instruction, 0), register(instruction, 1)];
  return {
    reads: [registerOperand(source)],
    writes: [registerOperand(target)],
    written: written(target, machine.registers.read(source)),
  };
}

/** Destination and register sources of a vector instruction (`op vD, vN[, vM]`). */
function vectorOperands(instruction: ShaListingInstruction, machine: ShaMachine, count: number) {
  const names = Array.from({ length: count }, (_, index) => register(instruction, index));
  return {
    target: names[0]!,
    sources: names.map((name) => machine.registers.read(name)),
    reads: names.map((name) => registerOperand(name)),
    writes: [registerOperand(names[0]!)],
  };
}

/** `rev32 vD.16b, vN.16b`: reverses the bytes of each word, W_t's bytes ↔ W_t. */
function byteSwap(instruction: ShaListingInstruction, machine: ShaMachine): ShaEffects {
  const target = register(instruction, 0);
  const source = register(instruction, 1);
  const lanes = machine.registers.read(source).map((lane) => {
    const swapped = byteSwapped(lane);
    if (swapped === undefined)
      throw new Error(`no traced value for a byte-swapped lane of ${source}`);
    return swapped;
  });
  return {
    reads: [registerOperand(source)],
    writes: [registerOperand(target)],
    written: written(target, lanes),
  };
}

/** `add vD.4s, vN.4s, vM.4s`: lane sums the trace records (K+W, the feed-forward). */
function addWords(instruction: ShaListingInstruction, machine: ShaMachine): ShaEffects {
  const target = register(instruction, 0);
  const [left, right] = [register(instruction, 1), register(instruction, 2)];
  const other = machine.registers.read(right);
  const lanes = machine.registers.read(left).map((lane, index) => {
    const sum = laneSum(lane, laneAt(other, index));
    if (sum === undefined) throw new Error(`no traced value for the sum in lane ${index}`);
    return sum;
  });
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

/** `sha256h Qd, Qn, Vm.4S`: rounds t … t+3; Qd = A…D in and out, Qn = E…H. */
function roundsAbcd(instruction: ShaListingInstruction, machine: ShaMachine): ShaEffects {
  const { target, sources, reads, writes } = vectorOperands(instruction, machine, 3);
  const [abcd, efgh, wk] = sources as [Lanes, Lanes, Lanes];
  const t = requiredShaRound(instruction);
  expectLanes(abcd, varLanes(ABCD, t - 1), `${target} must hold A…D before round ${t}`);
  expectLanes(
    efgh,
    varLanes(EFGH, t - 1),
    `${register(instruction, 1)} must hold E…H before round ${t}`,
  );
  expectRoundInput(instruction, wk, t);
  return { reads, writes, written: written(target, varLanes(ABCD, t + 3)) };
}

/** `sha256h2 Qd, Qn, Vm.4S`: rounds t … t+3; Qd = E…H in and out, Qn = the old A…D. */
function roundsEfgh(instruction: ShaListingInstruction, machine: ShaMachine): ShaEffects {
  const { target, sources, reads, writes } = vectorOperands(instruction, machine, 3);
  const [efgh, abcd, wk] = sources as [Lanes, Lanes, Lanes];
  const t = requiredShaRound(instruction);
  expectLanes(efgh, varLanes(EFGH, t - 1), `${target} must hold E…H before round ${t}`);
  expectLanes(
    abcd,
    varLanes(ABCD, t - 1),
    `${register(instruction, 1)} must hold the old A…D before round ${t}`,
  );
  expectRoundInput(instruction, wk, t);
  return { reads, writes, written: written(target, varLanes(EFGH, t + 3)) };
}

function scheduleWord(instruction: ShaListingInstruction): number {
  if (instruction.w === undefined) throw new Error('no schedule word');
  return instruction.w;
}

/** `sha256su0 Vd.4S, Vn.4S`: lane i ← W_{s−16+i} + σ0(W_{s−15+i}) = p1 of W_{s+i}. */
function scheduleUpdate0(instruction: ShaListingInstruction, machine: ShaMachine): ShaEffects {
  const { target, sources, reads, writes } = vectorOperands(instruction, machine, 2);
  const [before, next] = sources as [Lanes, Lanes];
  const s = scheduleWord(instruction);
  expectLanes(before, laneRun(word.w, s - 16), `${target} must hold W${s - 16}…W${s - 13}`);
  expectLanes(next, [word.w(s - 12)], `${register(instruction, 1)} must hold W${s - 12} in lane 0`);
  return { reads, writes, written: written(target, laneRun(word.p1, s)) };
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

const NO_EFFECTS: ShaEffects = { reads: [], writes: [], written: [] };

const SEMANTICS: Readonly<
  Record<string, (instruction: ShaListingInstruction, machine: ShaMachine) => ShaEffects>
> = {
  ldp: loadPair,
  stp: storePair,
  ldr: loadLiteral,
  /** The literal pool's page address in a scalar register (no vector lanes). */
  adrp: () => NO_EFFECTS,
  mov: move,
  rev32: byteSwap,
  add: addWords,
  sha256h: roundsAbcd,
  sha256h2: roundsEfgh,
  sha256su0: scheduleUpdate0,
  sha256su1: scheduleUpdate1,
  ret: () => NO_EFFECTS,
};

export function armShaExecute(instruction: ShaListingInstruction, machine: ShaMachine): ShaEffects {
  const semantics = SEMANTICS[instruction.mnemonic];
  if (semantics === undefined) throw new Error('no semantics for this mnemonic');
  return semantics(instruction, machine);
}

/** The next round instruction after `index` that writes register `target`, if any. */
function nextRoundWriting(
  instructions: readonly ShaListingInstruction[],
  index: number,
  target: string,
): ShaListingInstruction | undefined {
  return instructions
    .slice(index + 1)
    .find(
      (next) => isRoundInstruction(next) && armShaVectorRegister(next.operands[0] ?? '') === target,
    );
}

/** A `mov` that sets up the destination of the next `sha256h` (the ABCD copy) or `sha256h2` (the EFGH copy). */
function copyNote(
  instructions: readonly ShaListingInstruction[],
  index: number,
): I18nRef | undefined {
  const target = armShaVectorRegister(instructions[index]!.operands[0] ?? '');
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
  if (instruction.role === 'msg1' || instruction.role === 'msg2') {
    if (instruction.w === undefined) return undefined;
    return {
      key: `${NS}.note.scheduleAhead`,
      params: { first: instruction.w, last: instruction.w + 3 },
    };
  }
  if (instruction.mnemonic === 'ldr') {
    const t = literalRound(instruction.operands[1] ?? '');
    return t === undefined
      ? undefined
      : { key: `${NS}.note.literalK`, params: { first: t, last: t + 3 } };
  }
  return undefined;
}

/** The AArch64 ARMv8 SHA2 listing of one SHA-256 compression and how to read it. */
export const ARMV8_SHA_PROFILE: ShaIsaProfile = {
  deriverId: 'isa-armv8-sha',
  variant: 'aarch64-armv8-sha2',
  isa: 'aarch64',
  extension: 'armv8-sha2',
  syntax: 'arm',
  byteOrder: 'little',
  lanes: [8, 16, 32, 64],
  registerBits: 128,
  listing: sha256 as ShaListing,
  roundsPerInstruction: 4,
  vectorRegister: armShaVectorRegister,
  execute: armShaExecute,
  note: armShaNote,
};
