import type { I18nRef } from '@cryventure/core';
import { armVectorRegister, registerOperand } from '../_lib/isaFacets.ts';
import type { ShaListing, ShaListingInstruction } from '../_lib/listing.ts';
import {
  scheduleAheadNote,
  type ShaEffects,
  type ShaIsaProfile,
  type ShaMachine,
  type ShaSemantics,
} from '../_lib/sha/shaDerivation.ts';
import { NO_EFFECTS, operand, scheduleWord, written } from '../_lib/sha/shaOperands.ts';
import { expectLanes } from '../_lib/sha/shaRegisters.ts';
import { isRoundInstruction, requiredShaRound } from '../_lib/sha/shaSpans.ts';
import type { ShaVarName } from '../_lib/sha/shaTrace.ts';
import {
  blockInputLanes,
  laneAt,
  partialSumLanes,
  varLanes,
  word,
  type Lanes,
  type ShaWord,
} from '../_lib/sha/shaWords.ts';
import sha512 from './data/sha512.json';
import {
  addWords,
  byteSwap,
  DERIVER_ID,
  LITERAL,
  loadPair,
  memoryAccess,
  move,
  NS,
  register,
  storePair,
  VECTOR_BYTES,
  vectorOperands,
  wordsPerVector,
} from './profile.ts';

/**
 * ARMv8.2 SHA512 (FEAT_SHA512; docs/M6.md §5, Arm ARM SHA512H/SHA512H2/SHA512SU0/SHA512SU1) as
 * Linux `sha512-ce-core.S` uses it: the state in four registers (a, b), (c, d), (e, f), (g, h), lane 0
 * (the low 64 bits) first, and a fifth register rotating in. Two rounds t, t+1 per instruction pair,
 * each pair register holding round t+1 in lane 0 and round t in lane 1:
 * `sha512h Qd, Qn, Vm.2D` reads h + K + W of both rounds (`hKW`) from Qd, (f, g) from Qn and (d, e)
 * from Vm and writes (T1_{t+1}, T1_t); the `add` with (c, d) gives the new (e, f) = d + T1;
 * `sha512h2 Qd, Qn, Vm.2D` reads the T1 pair from Qd, (c, d) from Qn and (a, b) from Vm and writes
 * the new (a, b). Every value comes from the trace (`vars`, `w`, `h`, the wordops terms `kw`, `hKW`,
 * `T1`, `p1`); `ext` and the lane order only rearrange.
 */

const AB = ['a', 'b'] as const;
const CD = ['c', 'd'] as const;
const DE = ['d', 'e'] as const;
const FG = ['f', 'g'] as const;

/** Round t+1's word in lane 0 and round t's in lane 1, as SHA512H/SHA512H2 hold their per-round inputs. */
const roundPair = (make: (t: number) => ShaWord, t: number): Lanes => [make(t + 1), make(t)];

/** Working variables `names` (lane 0 first) before round t. */
const before = (names: readonly ShaVarName[], t: number): Lanes => varLanes(names, t - 1);

/** `#8` → 8. */
function immediate(text: string): number {
  const match = /^#\s*(\d+)$/.exec(text.trim());
  if (match === null) throw new Error(`"${text}" is not an immediate`);
  return Number(match[1]);
}

/**
 * Per listing, the first round t of the round constants K_t, K_{t+1} each literal load brings in: the
 * n-th literal load holds K_{2n}, K_{2n+1}. The order is checked by the dataflow, not trusted: a K
 * pair only sums with the W pair of the same rounds (`sumLanes`), else the walk throws.
 */
const literalRoundsCache = new WeakMap<readonly ShaListingInstruction[], Map<number, number>>();

function literalRounds(instructions: readonly ShaListingInstruction[]): Map<number, number> {
  let rounds = literalRoundsCache.get(instructions);
  if (rounds === undefined) {
    const loads = instructions.flatMap((instruction, index) =>
      isLiteralLoad(instruction) ? [index] : [],
    );
    rounds = new Map(loads.map((index, n) => [index, 2 * n]));
    literalRoundsCache.set(instructions, rounds);
  }
  return rounds;
}

function isLiteralLoad(instruction: ShaListingInstruction): boolean {
  return instruction.mnemonic === 'ldr' && LITERAL.test(instruction.operands[1] ?? '');
}

/** `ldr qN, [x8, :lo12:.LCPI0_n]`: K_t, K_{t+1} from the literal pool (a constant, no traced read). */
function loadConstants(instruction: ShaListingInstruction, machine: ShaMachine): ShaEffects {
  if (instruction.role !== 'addK') throw new Error('only round-constant literals are loaded');
  const target = register(instruction, 0);
  const t = literalRounds(machine.listing).get(machine.index)!;
  return {
    reads: [],
    writes: [registerOperand(target)],
    written: written(target, [word.k(t), word.k(t + 1)]),
  };
}

/** `ldr qN, [base, #off]`: one 16-byte load of two state words (or block bytes). */
function loadOne(instruction: ShaListingInstruction, machine: ShaMachine): ShaEffects {
  const target = register(instruction, 0);
  const valueRef = instruction.role === 'loadState' ? machine.chainIn : undefined;
  const { ref, firstWord } = memoryAccess(operand(instruction, 1), 0, machine.wordBytes, valueRef);
  const lanes = blockInputLanes(instruction.role, firstWord, wordsPerVector(machine));
  return { reads: [ref], writes: [registerOperand(target)], written: written(target, lanes) };
}

/** `ldr`: a literal (round constants) or a state load. */
function load(instruction: ShaListingInstruction, machine: ShaMachine): ShaEffects {
  return isLiteralLoad(instruction)
    ? loadConstants(instruction, machine)
    : loadOne(instruction, machine);
}

/**
 * `ext vD.16b, vN.16b, vM.16b, #imm`: bytes imm … 15 of vN, then bytes 0 … imm − 1 of vM. With
 * imm = 8 on 64-bit lanes: (vN lane 1, vM lane 0), e.g. (d, e) from (c, d) and (e, f), or the swapped
 * halves of K+W when vN = vM.
 */
function extract(instruction: ShaListingInstruction, machine: ShaMachine): ShaEffects {
  const target = register(instruction, 0);
  const [low, high] = [register(instruction, 1), register(instruction, 2)];
  const bytes = immediate(operand(instruction, 3));
  if (bytes % machine.wordBytes !== 0 || bytes > VECTOR_BYTES)
    throw new Error(`ext by ${bytes} bytes splits a word`);
  const joined = [...machine.registers.read(low), ...machine.registers.read(high)];
  const shift = bytes / machine.wordBytes;
  const lanes = Array.from({ length: wordsPerVector(machine) }, (_, lane) =>
    laneAt(joined, lane + shift),
  );
  return {
    reads: [...new Set([low, high])].map((name) => registerOperand(name)),
    writes: [registerOperand(target)],
    written: written(target, lanes),
  };
}

/**
 * `add vD.2d, vN.2d, vM.2d`: K + W, h + (K + W), d + T1 (the new e) and the feed-forward. The
 * compiler folds the new (e, f) of rounds 78, 79 into the feed-forward ((e, f) + (c, d), then + T1),
 * so that first sum is no value of the trace: it stays `partial` (no register bytes) until T1 joins it.
 */
function add(instruction: ShaListingInstruction, machine: ShaMachine): ShaEffects {
  if (instruction.role !== 'feedForward') return addWords(instruction, machine);
  const target = register(instruction, 0);
  const [left, right] = [register(instruction, 1), register(instruction, 2)];
  const lanes = partialSumLanes(
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

/** `sha512h Qd, Qn, Vm.2D`: (hKW_{t+1}, hKW_t), (f, g), (d, e) before round t → (T1_{t+1}, T1_t). */
function roundsFirstHalf(instruction: ShaListingInstruction, machine: ShaMachine): ShaEffects {
  const { target, sources, reads, writes } = vectorOperands(instruction, machine, 3);
  const [hkw, fg, de] = sources as [Lanes, Lanes, Lanes];
  const t = requiredShaRound(instruction);
  expectLanes(hkw, roundPair(word.hKW, t), `${target} must hold h+K+W of rounds ${t}, ${t + 1}`);
  expectLanes(fg, before(FG, t), `${register(instruction, 1)} must hold (f, g) before round ${t}`);
  expectLanes(de, before(DE, t), `${register(instruction, 2)} must hold (d, e) before round ${t}`);
  return { reads, writes, written: written(target, roundPair(word.T1, t)) };
}

/** `sha512h2 Qd, Qn, Vm.2D`: (T1_{t+1}, T1_t), (c, d), (a, b) before round t → (a, b) after round t+1. */
function roundsSecondHalf(instruction: ShaListingInstruction, machine: ShaMachine): ShaEffects {
  const { target, sources, reads, writes } = vectorOperands(instruction, machine, 3);
  const [t1, cd, ab] = sources as [Lanes, Lanes, Lanes];
  const t = requiredShaRound(instruction);
  expectLanes(t1, roundPair(word.T1, t), `${target} must hold T1 of rounds ${t}, ${t + 1}`);
  expectLanes(cd, before(CD, t), `${register(instruction, 1)} must hold (c, d) before round ${t}`);
  expectLanes(ab, before(AB, t), `${register(instruction, 2)} must hold (a, b) before round ${t}`);
  return { reads, writes, written: written(target, varLanes(AB, t + 1)) };
}

/** `sha512su0 Vd.2D, Vn.2D`: (W_{s−16}, W_{s−15}) and W_{s−14} in Vn lane 0 → (p1 of W_s, p1 of W_{s+1}). */
function scheduleUpdate0(instruction: ShaListingInstruction, machine: ShaMachine): ShaEffects {
  const { target, sources, reads, writes } = vectorOperands(instruction, machine, 2);
  const [old, next] = sources as [Lanes, Lanes];
  const s = scheduleWord(instruction);
  expectLanes(old, [word.w(s - 16), word.w(s - 15)], `${target} must hold W${s - 16}, W${s - 15}`);
  expectLanes(next, [word.w(s - 14)], `${register(instruction, 1)} must hold W${s - 14} in lane 0`);
  return { reads, writes, written: written(target, [word.p1(s), word.p1(s + 1)]) };
}

/**
 * `sha512su1 Vd.2D, Vn.2D, Vm.2D`: p1 + σ1(W_{s−2}) + W_{s−7} = W_s per lane, with the p1 pair in Vd,
 * (W_{s−2}, W_{s−1}) in Vn and (W_{s−7}, W_{s−6}) in Vm.
 */
function scheduleUpdate1(instruction: ShaListingInstruction, machine: ShaMachine): ShaEffects {
  const { target, sources, reads, writes } = vectorOperands(instruction, machine, 3);
  const [partial, recent, middle] = sources as [Lanes, Lanes, Lanes];
  const s = scheduleWord(instruction);
  const [vn, vm] = [register(instruction, 1), register(instruction, 2)];
  expectLanes(partial, [word.p1(s), word.p1(s + 1)], `${target} must hold p1 of W${s}, W${s + 1}`);
  expectLanes(recent, [word.w(s - 2), word.w(s - 1)], `${vn} must hold W${s - 2}, W${s - 1}`);
  expectLanes(middle, [word.w(s - 7), word.w(s - 6)], `${vm} must hold W${s - 7}, W${s - 6}`);
  return { reads, writes, written: written(target, [word.w(s), word.w(s + 1)]) };
}

const SEMANTICS: Readonly<Record<string, ShaSemantics>> = {
  ldp: loadPair,
  stp: storePair,
  ldr: load,
  /** The literal pool's page address in a scalar register (no vector lanes). */
  adrp: () => NO_EFFECTS,
  mov: move,
  rev64: byteSwap,
  ext: extract,
  add,
  sha512h: roundsFirstHalf,
  sha512h2: roundsSecondHalf,
  sha512su0: scheduleUpdate0,
  sha512su1: scheduleUpdate1,
  ret: () => NO_EFFECTS,
};

/** The vector register operand `index` of an instruction names, or `undefined`. */
const operandRegister = (instruction: ShaListingInstruction | undefined, index: number) =>
  armVectorRegister(instruction?.operands[index] ?? '');

/** The last instruction before `index` that writes `reg` (operand 0), if any. */
function lastWriter(
  instructions: readonly ShaListingInstruction[],
  index: number,
  reg: string | undefined,
): ShaListingInstruction | undefined {
  return instructions
    .slice(0, index)
    .findLast((instruction) => operandRegister(instruction, 0) === reg);
}

/** The first instruction after `index` that names `reg` in any operand, if any. */
function nextUse(
  instructions: readonly ShaListingInstruction[],
  index: number,
  reg: string | undefined,
): ShaListingInstruction | undefined {
  return instructions
    .slice(index + 1)
    .find((instruction) => instruction.operands.some((text) => armVectorRegister(text) === reg));
}

/** An `add` of the K+W chain: K+W itself (one source straight from the literal pool), else h + K + W. */
function addKNote(instructions: readonly ShaListingInstruction[], index: number): I18nRef {
  const sources = [1, 2].map((position) => operandRegister(instructions[index], position));
  const fromLiteral = sources.some((reg) => {
    const writer = lastWriter(instructions, index, reg);
    return writer !== undefined && isLiteralLoad(writer);
  });
  return { key: `${NS}.note.${fromLiteral ? 'addKw512' : 'addHkw'}` };
}

/** A feed-forward `add` whose sum only a later feed-forward `add` completes (the folded rounds 78, 79). */
function feedForwardNote(instructions: readonly ShaListingInstruction[], index: number): I18nRef {
  const next = nextUse(instructions, index, operandRegister(instructions[index], 0));
  const partial = next?.role === 'feedForward' && next.mnemonic === 'add';
  return { key: `${NS}.note.${partial ? 'partialFeedForward' : 'feedForward512'}` };
}

/** A `mov` that keeps the T1 pair which the next sha512h2 overwrites. */
function copyNote(
  instructions: readonly ShaListingInstruction[],
  index: number,
): I18nRef | undefined {
  const target = operandRegister(instructions[index], 0);
  const consumer = instructions
    .slice(index + 1)
    .find((next) => isRoundInstruction(next) && operandRegister(next, 0) === target);
  return consumer?.mnemonic === 'sha512h2' ? { key: `${NS}.note.copyT1` } : undefined;
}

/** Notes by role on the helper instructions (`ext`, `ldr`, `add`). */
function helperNote(
  instructions: readonly ShaListingInstruction[],
  index: number,
): I18nRef | undefined {
  const { mnemonic, role } = instructions[index]!;
  if (mnemonic === 'ext' && role === 'packState') return { key: `${NS}.note.pairState` };
  if (mnemonic === 'ext' && role === 'addK') return { key: `${NS}.note.swapKw` };
  if (mnemonic === 'ext' && role === 'msg2') return { key: `${NS}.note.pairSchedule` };
  if (mnemonic === 'add' && role === 'rounds') return { key: `${NS}.note.newE` };
  if (mnemonic === 'add' && role === 'addK') return addKNote(instructions, index);
  if (mnemonic === 'add' && role === 'feedForward') return feedForwardNote(instructions, index);
  if (mnemonic === 'mov') return copyNote(instructions, index);
  const t = literalRounds(instructions).get(index);
  return t === undefined
    ? undefined
    : { key: `${NS}.note.literalK`, params: { first: t, last: t + 1 } };
}

/**
 * Notes: the two halves of a two-round step, the new (e, f), how K + W becomes h + K + W, the lane
 * swaps and pairings `ext` makes, the folded feed-forward, round constants from the literal pool and
 * the schedule running ahead of the rounds.
 */
export function armSha512Note(
  instructions: readonly ShaListingInstruction[],
  index: number,
): I18nRef | undefined {
  const instruction = instructions[index]!;
  if (instruction.mnemonic === 'sha512h') return { key: `${NS}.note.sha512h` };
  if (instruction.mnemonic === 'sha512h2') return { key: `${NS}.note.sha512h2` };
  if (instruction.mnemonic === 'sha512su0' || instruction.mnemonic === 'sha512su1') {
    const note = scheduleAheadNote(DERIVER_ID, instruction, 2);
    return note === undefined ? undefined : { ...note, key: `${NS}.note.scheduleAhead512` };
  }
  return helperNote(instructions, index);
}

/** The AArch64 ARMv8.2 SHA512 listing of one SHA-512 compression and how to read it. */
export const ARMV8_SHA512_PROFILE: ShaIsaProfile = {
  deriverId: DERIVER_ID,
  variant: 'aarch64-armv8-sha512',
  isa: 'aarch64',
  extension: 'armv8.2-sha512',
  syntax: 'arm',
  byteOrder: 'little',
  lanes: [8, 16, 32, 64],
  registerBits: 128,
  wordBits: 64,
  labelNamespace: `${NS}.sha512`,
  listing: sha512 as ShaListing,
  roundsPerInstruction: 2,
  vectorRegister: armVectorRegister,
  semantics: SEMANTICS,
  note: armSha512Note,
};
