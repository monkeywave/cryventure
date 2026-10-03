import type { I18nRef } from '../i18n.ts';
import { alignShapeIssues, type AlignSpan } from './align.ts';
import { isHexAddress } from './memory.ts';

/**
 * Instructions facet: an assembly listing of one ISA extension, each instruction aligned to the
 * state steps it covers (docs/M4.md §1e, §3b). Mnemonics and operands are data as printed, not prose.
 */

export type OperandRef =
  | { kind: 'reg'; name: string; valueRef?: string }
  | { kind: 'mem'; base: string; offset: number; size: number; valueRef?: string };

export interface Instruction {
  /** Offset in the listing, lowercase hex. */
  address: string;
  mnemonic: string;
  /** As printed. */
  operands: string[];
  reads: OperandRef[];
  writes: OperandRef[];
  align: AlignSpan;
  /** The AES operations this instruction performs, in its order. */
  covers?: I18nRef[];
  /** E.g. the fusion note on aese/aesmc pairs. */
  note?: I18nRef;
}

export interface InstructionsFacet {
  kind: 'instructions';
  schemaVersion: 1;
  /** Open: 'x86_64', 'aarch64', later 'riscv64'. */
  isa: string;
  /** E.g. 'aesni', 'armv8-ce'. */
  extension: string;
  label: I18nRef;
  syntax: 'intel' | 'att' | 'arm';
  source: { compiler: string; flags: string; triple: string; function: string; compilerExplorerUrl?: string };
  /** Monotonic `align` spans. */
  instructions: Instruction[];
}

function operandIssues(operand: OperandRef, where: string): string[] {
  if (operand.kind === 'reg') return operand.name === '' ? [`${where}: register operand without a name`] : [];
  const { offset, size } = operand;
  const sizeOk = Number.isInteger(size) && size > 0;
  return Number.isInteger(offset) && sizeOk ? [] : [`${where}: memory operand offset ${offset} / size ${size} invalid`];
}

function instructionIssues(instruction: Instruction, index: number): string[] {
  const where = `instructions: instruction ${index}`;
  const issues = isHexAddress(instruction.address) ? [] : [`${where}: address "${instruction.address}" is not lowercase hex`];
  if (instruction.mnemonic === '') issues.push(`${where}: empty mnemonic`);
  for (const operand of [...instruction.reads, ...instruction.writes]) issues.push(...operandIssues(operand, where));
  return issues;
}

/** Schema problems of an instructions facet (empty = valid): hex addresses, mnemonics, operand refs, monotonic spans. */
export function validateInstructionsFacet(facet: InstructionsFacet): string[] {
  return [
    ...facet.instructions.flatMap(instructionIssues),
    ...alignShapeIssues(
      facet.instructions.map((instruction) => instruction.align),
      'instructions',
    ),
  ];
}
