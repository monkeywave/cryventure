import {
  facetKey,
  type AlignSpan,
  type FacetKey,
  type I18nRef,
  type Instruction,
  type InstructionsFacet,
  type OperandRef,
  type RegisterSpec,
  type RegisterStep,
  type RegisterWrite,
  type RegistersFacet,
} from '@cryventure/core';
import { armSimdRegister, listingSource, type Listing, type MemOperand } from './listing.ts';
import { withValueRef } from './valueRef.ts';

/**
 * The algorithm-independent half of an ISA deriver (AES in M4, SHA in M5): operand refs, the register
 * file spec of the registers a listing uses, and the `instructions@<variant>` / `registers@<variant>`
 * facet pair. The derivers differ only in how they walk their listings.
 */

/** Names and metadata of one ISA variant. Message keys live under `deriver.<deriverId>.*`. */
export interface IsaVariant {
  deriverId: string;
  variant: string;
  isa: string;
  extension: string;
  syntax: InstructionsFacet['syntax'];
  byteOrder: 'little' | 'big';
}

/** 128-bit little-endian vector registers with 8 … 64-bit lanes (SSE, AArch64 SIMD). */
export const VECTOR_128_LE: { byteOrder: 'little'; lanes: number[]; registerBits: number } = {
  byteOrder: 'little',
  lanes: [8, 16, 32, 64],
  registerBits: 128,
};

/** What a listing walk produced: the instructions and the register writes per instruction. */
export interface IsaWalk {
  instructions: Instruction[];
  steps: RegisterStep[];
}

/** A walk over several runs of a listing (blocks, permutations): what it produced and the span it ended on. */
export interface RunningIsaWalk extends IsaWalk {
  previous: AlignSpan;
}

/** An instruction as a listing lists it (AES `ListingInstruction`, SHA `ShaListingInstruction`). */
type ListedInstruction = { address: string; mnemonic: string; operands: readonly string[] };

/** `xmm0` … `xmm15`. */
const XMM = /^xmm\d+$/;

/** An `xmm` operand's register name, or `undefined`. */
export function x86VectorRegister(operand: string): string | undefined {
  return XMM.test(operand) ? operand : undefined;
}

/** Canonical name `v<n>` of an AArch64 vector operand (`q1`, `v1.16b`, `v1.4s`; not a `d` view), or `undefined`. */
export function armVectorRegister(operand: string): string | undefined {
  return operand.startsWith('d') ? undefined : armSimdRegister(operand);
}

/** An error naming the listed instruction: `listing <address> <mnemonic>: <reason>`. */
export function listingError(instruction: ListedInstruction, reason: unknown): Error {
  const message = reason instanceof Error ? reason.message : String(reason);
  return new Error(`listing ${instruction.address} ${instruction.mnemonic}: ${message}`);
}

/** The semantics `semantics` give `mnemonic`; throws when they have none. */
export function semanticsOf<S>(semantics: Readonly<Record<string, S>>, mnemonic: string): S {
  const found = semantics[mnemonic];
  if (found === undefined) throw new Error('no semantics for this mnemonic');
  return found;
}

/** Runs `run` for the listed instruction, naming the instruction in any error it throws. */
export function namingErrors<T>(listed: ListedInstruction, run: () => T): T {
  try {
    return run();
  } catch (error) {
    throw listingError(listed, error);
  }
}

/** Appends `instruction` to the walk and, when it wrote registers (`writes` given), a register step on its span. */
export function recordInstruction(
  walk: IsaWalk,
  instruction: Instruction,
  writes: RegisterWrite[] | undefined,
): void {
  walk.instructions.push(instruction);
  if (writes !== undefined) walk.steps.push({ align: instruction.align, writes });
}

/** The facet instruction of a listed one: its operand refs, span and optional chips and note. */
export function buildInstruction(
  listed: ListedInstruction,
  align: AlignSpan,
  effects: Pick<Instruction, 'reads' | 'writes'>,
  covers: I18nRef[],
  note: I18nRef | undefined,
): Instruction {
  const instruction: Instruction = {
    address: listed.address,
    mnemonic: listed.mnemonic,
    operands: [...listed.operands],
    reads: effects.reads,
    writes: effects.writes,
    align,
  };
  if (covers.length > 0) instruction.covers = covers;
  if (note !== undefined) instruction.note = note;
  return instruction;
}

/** A `size`-byte memory access at `[base + offset]`. */
export function memoryOperand(address: MemOperand, size: number, valueRef?: string): OperandRef {
  return withValueRef(
    { kind: 'mem' as const, base: address.base, offset: address.offset, size },
    valueRef,
  );
}

export function registerOperand(name: string, valueRef?: string): OperandRef {
  return withValueRef({ kind: 'reg' as const, name }, valueRef);
}

export function registerWrite(reg: string, bytes: number[], valueRef?: string): RegisterWrite {
  return withValueRef({ reg, bytes }, valueRef);
}

function registerNumber(name: string): number {
  return Number(/\d+$/.exec(name)?.[0] ?? 0);
}

/** One spec per distinct register name, sorted by register number. */
export function vectorRegisterSpecs(
  names: Iterable<string>,
  bits: number,
  lanes: readonly number[],
): RegisterSpec[] {
  return [...new Set(names)]
    .sort((a, b) => registerNumber(a) - registerNumber(b))
    .map((name) => ({ name, bits, lanes: [...lanes] }));
}

/** An ISA variant whose registers are the vector registers its listing names. */
export interface VectorIsa extends IsaVariant {
  lanes: readonly number[];
  registerBits: number;
  /** Canonical vector register name of an operand, or `undefined`. */
  vectorRegister(operand: string): string | undefined;
}

/** `instructions@<variant>` and `registers@<variant>` of a walk, with one register spec per vector register the listing names. */
export function listingFacetPair(
  variant: VectorIsa,
  listing: Omit<Listing, 'instructions' | 'source'> & {
    instructions: readonly ListedInstruction[];
  },
  walk: IsaWalk,
): Partial<Record<FacetKey, unknown>> {
  const names = listing.instructions.flatMap((instruction) =>
    instruction.operands.flatMap((operand) => variant.vectorRegister(operand) ?? []),
  );
  const { instructions, steps } = walk;
  return isaFacetPair(
    variant,
    listing,
    { instructions, steps },
    vectorRegisterSpecs(names, variant.registerBits, variant.lanes),
  );
}

/** `instructions@<variant>` and `registers@<variant>` from a walk over `listing`. */
export function isaFacetPair(
  variant: IsaVariant,
  listing: Pick<Listing, 'compiler' | 'flags' | 'triple' | 'function' | 'compilerExplorerUrl'>,
  walk: IsaWalk,
  registers: RegisterSpec[],
): Partial<Record<FacetKey, unknown>> {
  const namespace = `deriver.${variant.deriverId}`;
  const instructions: InstructionsFacet = {
    kind: 'instructions',
    schemaVersion: 1,
    isa: variant.isa,
    extension: variant.extension,
    label: { key: `${namespace}.label` },
    syntax: variant.syntax,
    source: listingSource(listing),
    instructions: walk.instructions,
  };
  const registersFacet: RegistersFacet = {
    kind: 'registers',
    schemaVersion: 1,
    label: { key: `${namespace}.registers.label` },
    file: { isa: variant.isa, byteOrder: variant.byteOrder, registers },
    steps: walk.steps,
  };
  return {
    [facetKey('instructions', variant.variant)]: instructions,
    [facetKey('registers', variant.variant)]: registersFacet,
  };
}
