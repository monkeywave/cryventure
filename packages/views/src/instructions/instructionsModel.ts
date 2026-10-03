import {
  appliedThrough,
  currentAt,
  type Instruction,
  type InstructionsFacet,
  type OperandRef,
} from '@cryventure/core';

/**
 * Pure model of the instructions view: each row's status at the playhead (core `currentAt` /
 * `appliedThrough`, docs/M4.md §1e) and the ValueRefs behind each printed operand.
 */

/** `current`: the instruction covering the playhead; `executed`: its effects are visible; `pending`: not run yet. */
export type RowStatus = 'current' | 'executed' | 'pending';

export interface ListingProgress {
  current: number | undefined;
  applied: number;
}

export function listingProgress(facet: InstructionsFacet, p: number): ListingProgress {
  const spans = facet.instructions.map((instruction) => instruction.align);
  return { current: currentAt(spans, p), applied: appliedThrough(spans, p) };
}

export function rowStatus(index: number, { current, applied }: ListingProgress): RowStatus {
  if (index === current) return 'current';
  return index <= applied ? 'executed' : 'pending';
}

/** The register an operand names as printed, without an arrangement suffix (`v1.16b` → `v1`). */
function registerToken(operand: string): string {
  return operand.trim().toLowerCase().split('.')[0] ?? '';
}

/** The base register inside a memory operand's brackets (`xmmword ptr [rdx + 16]` → `rdx`, `[x2, #32]` → `x2`). */
function memoryBase(operand: string): string | undefined {
  return /\[\s*([a-z0-9_]+)/i.exec(operand)?.[1]?.toLowerCase();
}

function matchesText(operand: string, ref: OperandRef): boolean {
  const base = memoryBase(operand);
  if (base !== undefined) return ref.kind === 'mem' && ref.base.toLowerCase() === base;
  return ref.kind === 'reg' && ref.name.toLowerCase() === registerToken(operand);
}

const distinct = (values: readonly string[]) => [...new Set(values)];

/** Names of the registers (writes first) no printed operand names textually. */
function unmatchedRegisters(instruction: Instruction, refs: readonly OperandRef[]): string[] {
  const unmatched = refs.filter(
    (ref) => !instruction.operands.some((operand) => matchesText(operand, ref)),
  );
  return distinct(unmatched.flatMap((ref) => (ref.kind === 'reg' ? [ref.name] : [])));
}

/**
 * The refs a printed operand stands for. A register printed more than once (`eor v0, v0, v2`) is the
 * written destination at its first occurrence and a read source after that.
 */
function refsOf(instruction: Instruction, index: number, spare: string[]): OperandRef[] {
  const operand = instruction.operands[index] ?? '';
  const refs = [...instruction.writes, ...instruction.reads];
  const matched = refs.filter((ref) => matchesText(operand, ref));
  if (matched.length === 0 && memoryBase(operand) === undefined) {
    const alias = spare.shift();
    return alias === undefined
      ? []
      : refs.filter((ref) => ref.kind === 'reg' && ref.name === alias);
  }
  const occurrences = instruction.operands.filter(
    (other) => memoryBase(other) === undefined && registerToken(other) === registerToken(operand),
  ).length;
  if (occurrences < 2 || memoryBase(operand) !== undefined) return matched;
  const first =
    instruction.operands.findIndex((other) => registerToken(other) === registerToken(operand)) ===
    index;
  return matched.filter((ref) => (first ? instruction.writes : instruction.reads).includes(ref));
}

/**
 * The ValueRef ids behind each printed operand (same order as `operands`). An operand matches the refs
 * that name its register or its memory base; register operands printed under an alias the refs do not
 * use (`q1` for `v1`) take the remaining register refs in order, writes first. Data-driven: no ISA tables.
 */
export function operandValueRefs(instruction: Instruction): string[][] {
  const spare = unmatchedRegisters(instruction, [...instruction.writes, ...instruction.reads]);
  return instruction.operands.map((_, index) =>
    distinct(
      refsOf(instruction, index, spare).flatMap((ref) =>
        ref.valueRef === undefined ? [] : [ref.valueRef],
      ),
    ),
  );
}
