import type { OperandRef } from '@cryventure/core';
import { parseMemOperand, type MemOperand, type ShaListingInstruction } from '../listing.ts';
import type { ShaEffects } from './shaDerivation.ts';
import { expectLanes } from './shaRegisters.ts';
import { laneRun, word, type Lanes } from './shaWords.ts';

/**
 * Operand and lane helpers the SHA ISA profiles share (docs/M5.md §5c), and the one schedule step
 * both ISAs encode the same way: `sha256msg1` (x86) and `sha256su0` (ARMv8).
 */

/** An instruction without effects on the vector registers (`ret`, a scalar address computation). */
export const NO_EFFECTS: ShaEffects = { reads: [], writes: [], written: [] };

/** A listed instruction's operands (any family: SHA, Keccak). */
type Operands = Pick<ShaListingInstruction, 'operands'>;

/** Operand `index` of the listed instruction; throws when it has none. */
export function operand(instruction: Operands, index: number): string {
  const text = instruction.operands[index];
  if (text === undefined) throw new Error(`no operand ${index}`);
  return text;
}

/**
 * A reader of vector register operands: the canonical name `vectorRegister` gives operand `index`;
 * throws `operand <index> is not <what>` otherwise.
 */
export function vectorOperandReader(
  vectorRegister: (operand: string) => string | undefined,
  what: string,
): (instruction: Operands, index: number) => string {
  return (instruction, index) => {
    const name = vectorRegister(operand(instruction, index));
    if (name === undefined) throw new Error(`operand ${index} is not ${what}`);
    return name;
  };
}

/** The `[base + offset]` of a memory operand; throws when `text` is none. */
export function requiredMemOperand(text: string): MemOperand {
  const parsed = parseMemOperand(text);
  if (parsed === undefined) throw new Error(`"${text}" is not a memory operand`);
  return parsed;
}

/** One register `reg` left holding `lanes`. */
export function written(reg: string, lanes: Lanes): ShaEffects['written'] {
  return [{ reg, lanes }];
}

/** The first schedule word W_s a message instruction works on (the listing's `w`); throws without one. */
export function scheduleWord(instruction: ShaListingInstruction): number {
  if (instruction.w === undefined) throw new Error('no schedule word');
  return instruction.w;
}

/** A two-register read-modify-write instruction: the destination and source, their lanes, and the operand refs. */
export interface BinaryOperands {
  target: string;
  source: string;
  /** What `target` holds before the instruction. */
  before: Lanes;
  /** What `source` holds. */
  other: Lanes;
  reads: OperandRef[];
  writes: OperandRef[];
}

/**
 * `sha256msg1 xmm1, xmm2` / `sha256su0 Vd.4S, Vn.4S`: lane i ← W_{s−16+i} + σ0(W_{s−15+i}) = p1 of
 * W_{s+i}; the target holds W_{s−16} … W_{s−13}, the source W_{s−12} in lane 0.
 */
export function scheduleP1(
  instruction: ShaListingInstruction,
  operands: BinaryOperands,
): ShaEffects {
  const { target, source, before, other, reads, writes } = operands;
  const s = scheduleWord(instruction);
  expectLanes(before, laneRun(word.w, s - 16), `${target} must hold W${s - 16}…W${s - 13}`);
  expectLanes(other, [word.w(s - 12)], `${source} must hold W${s - 12} in lane 0`);
  return { reads, writes, written: written(target, laneRun(word.p1, s)) };
}
