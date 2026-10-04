import type {
  AlignSpan,
  FacetKey,
  I18nRef,
  OperandRef,
  RegisterSpec,
  RegisterWrite,
  TraceBundle,
} from '@cryventure/core';
import {
  AES_BLOCK_BYTES,
  opStep,
  requiredSubkeyId,
  roundKeyBytesAt,
  stateBytesAt,
} from './aesTrace.ts';
import {
  buildInstruction,
  isaFacetPair,
  listingError,
  memoryOperand,
  registerOperand,
  registerWrite,
  vectorRegisterSpecs,
  type IsaVariant,
  type IsaWalk,
} from './isaFacets.ts';
import { INITIAL_SPAN, instructionSpan, nextFrom, type CoveredOp } from './isaSpans.ts';
import {
  listingForRounds,
  parseMemOperand,
  type Listing,
  type ListingInstruction,
} from './listing.ts';
import { RegisterBank } from './registerBank.ts';
import { traceContext, type TraceContext } from './traceContext.ts';

/**
 * Turns a precomputed AES listing into `instructions@<variant>` and `registers@<variant>` facets
 * (docs/M4.md §5). Spans come from the ops each instruction covers; register values come from the
 * trace only (`stateAt` at `align.last`, round keys from region `w`). No AES is computed here.
 */

/** What an ISA deriver contributes: its names, how it reads operands, and which ops each instruction covers. */
export interface IsaProfile extends IsaVariant {
  /** Lane widths the vector registers offer, e.g. [8, 16, 32, 64]. */
  lanes: number[];
  /** Listings by round count Nr. */
  listings: Readonly<Record<number, Listing>>;
  /** Canonical vector register name of an operand (`q1`, `v1.16b` → `v1`), or `undefined`. */
  vectorRegister(operand: string): string | undefined;
  /** The AES ops an AES instruction performs, in its order; [] for loads, stores and `ret`. */
  covers(instruction: ListingInstruction): CoveredOp[];
  /** An optional note on the instruction at `index` (e.g. the aese/aesmc fusion note). */
  note?(instructions: readonly ListingInstruction[], index: number): I18nRef | undefined;
}

const VECTOR_BITS = AES_BLOCK_BYTES * 8;

/** What one instruction reads and writes, plus the register values it leaves behind. */
interface Effects {
  reads: OperandRef[];
  writes: OperandRef[];
  registerWrites: RegisterWrite[];
}

const NO_EFFECTS: Effects = { reads: [], writes: [], registerWrites: [] };

function vectorRegisters(profile: IsaProfile, instruction: ListingInstruction): string[] {
  return instruction.operands
    .map((operand) => profile.vectorRegister(operand))
    .filter((name): name is string => name !== undefined);
}

function memOperand(
  instruction: ListingInstruction,
  index: number,
  valueRef: string | undefined,
): OperandRef {
  const operand = instruction.operands.map(parseMemOperand).find((parsed) => parsed !== undefined);
  if (operand === undefined) throw listingError(instruction, 'no memory operand');
  return memoryOperand(
    { base: operand.base, offset: operand.offset + index * AES_BLOCK_BYTES },
    AES_BLOCK_BYTES,
    valueRef,
  );
}

function only<T>(items: readonly T[], instruction: ListingInstruction, what: string): T {
  const [item] = items;
  if (item === undefined || items.length !== 1)
    throw listingError(instruction, `expected one ${what}, got ${items.length}`);
  return item;
}

function requiredKeyIndex(instruction: ListingInstruction): number {
  if (instruction.keyIndex === undefined) throw listingError(instruction, 'no keyIndex');
  return instruction.keyIndex;
}

function subkeyId(ctx: TraceContext, index: number): string {
  return requiredSubkeyId(ctx.subkeys, index);
}

function loadStateEffects(
  ctx: TraceContext,
  bank: RegisterBank,
  instruction: ListingInstruction,
  registers: string[],
  span: AlignSpan,
): Effects {
  const register = only(registers, instruction, 'vector register');
  bank.writeState(register);
  const bytes = stateBytesAt(ctx.facet, span.last);
  return {
    reads: [memOperand(instruction, 0, ctx.plaintextId)],
    writes: [registerOperand(register, ctx.plaintextId)],
    registerWrites: [registerWrite(register, bytes, ctx.plaintextId)],
  };
}

function loadKeyEffects(
  ctx: TraceContext,
  bank: RegisterBank,
  instruction: ListingInstruction,
  registers: string[],
): Effects {
  const first = requiredKeyIndex(instruction);
  const keys = registers.map((register, offset) => ({
    register,
    index: first + offset,
    id: subkeyId(ctx, first + offset),
  }));
  keys.forEach(({ register, index }) => bank.writeKey(register, index));
  return {
    reads: keys.map(({ id }, offset) => memOperand(instruction, offset, id)),
    writes: keys.map(({ register, id }) => registerOperand(register, id)),
    registerWrites: keys.map(({ register, index, id }) =>
      registerWrite(register, roundKeyBytesAt(ctx.facet, ctx.keyScheduleStep, index), id),
    ),
  };
}

function storeEffects(
  ctx: TraceContext,
  bank: RegisterBank,
  instruction: ListingInstruction,
  registers: string[],
): Effects {
  const register = only(registers, instruction, 'vector register');
  if (!bank.holdsCurrentState(register))
    throw listingError(instruction, `${register} does not hold the state`);
  return {
    reads: [registerOperand(register)],
    writes: [memOperand(instruction, 0, ctx.ciphertextId)],
    registerWrites: [],
  };
}

/** Registers an AES instruction reads: `aesmc Vd, Vn` and three-operand forms read all but the destination. */
function sourceRegisters(instruction: ListingInstruction, registers: string[]): string[] {
  const readsDestination = instruction.role !== 'aesmc' && registers.length <= 2;
  return [...new Set(readsDestination ? registers : registers.slice(1))];
}

function sourceRead(
  ctx: TraceContext,
  bank: RegisterBank,
  instruction: ListingInstruction,
  register: string,
): OperandRef {
  if (bank.holdsCurrentState(register)) return registerOperand(register);
  const keyIndex = instruction.keyIndex;
  if (keyIndex !== undefined && bank.holdsKey(register, keyIndex))
    return registerOperand(register, subkeyId(ctx, keyIndex));
  throw listingError(
    instruction,
    `${register} holds neither the state nor round key ${keyIndex ?? '-'}`,
  );
}

function assertOperandsComplete(instruction: ListingInstruction, reads: OperandRef[]): void {
  const keyReads = reads.filter((read) => read.valueRef !== undefined).length;
  const expectedKeys = instruction.role === 'aesmc' ? 0 : 1;
  if (keyReads !== expectedKeys || reads.length !== expectedKeys + 1)
    throw listingError(instruction, 'expected the state and its round key as sources');
}

function aesEffects(
  ctx: TraceContext,
  bank: RegisterBank,
  instruction: ListingInstruction,
  registers: string[],
  span: AlignSpan,
): Effects {
  const destination = registers[0];
  if (destination === undefined) throw listingError(instruction, 'no destination register');
  const reads = sourceRegisters(instruction, registers).map((register) =>
    sourceRead(ctx, bank, instruction, register),
  );
  assertOperandsComplete(instruction, reads);
  bank.writeState(destination);
  const isFinal = span.last === opStep(ctx.ops, 'addRoundKey', ctx.ops.rounds);
  const valueRef = isFinal ? ctx.ciphertextId : undefined;
  return {
    reads,
    writes: [registerOperand(destination, valueRef)],
    registerWrites: [registerWrite(destination, stateBytesAt(ctx.facet, span.last), valueRef)],
  };
}

function effectsOf(
  ctx: TraceContext,
  bank: RegisterBank,
  profile: IsaProfile,
  instruction: ListingInstruction,
  span: AlignSpan,
): Effects {
  const registers = vectorRegisters(profile, instruction);
  switch (instruction.role) {
    case 'loadState':
      return loadStateEffects(ctx, bank, instruction, registers, span);
    case 'loadKey':
      return loadKeyEffects(ctx, bank, instruction, registers);
    case 'store':
      return storeEffects(ctx, bank, instruction, registers);
    case 'other':
      return NO_EFFECTS;
    default:
      return aesEffects(ctx, bank, instruction, registers, span);
  }
}

function coversRefs(profile: IsaProfile, covers: readonly CoveredOp[]): I18nRef[] {
  return covers.map(({ op, round }) => ({
    key: `deriver.${profile.deriverId}.op.${op}`,
    params: { round },
  }));
}

/** Per instruction, the `first` step of the next instruction that covers AES ops (§1e). */
function nextAesFirsts(
  ctx: TraceContext,
  coverage: readonly CoveredOp[][],
): (number | undefined)[] {
  return nextFrom(coverage, ([first]) =>
    first === undefined ? undefined : opStep(ctx.ops, first.op, first.round),
  );
}

function walkListing(ctx: TraceContext, profile: IsaProfile, listing: Listing): IsaWalk {
  const bank = new RegisterBank();
  const walk: IsaWalk = { instructions: [], steps: [] };
  const coverage = listing.instructions.map((listed) => profile.covers(listed));
  const nextAesFirst = nextAesFirsts(ctx, coverage);
  let previous = INITIAL_SPAN;
  listing.instructions.forEach((listed, index) => {
    const covered = coverage[index] ?? [];
    const span = instructionSpan(listed.role, covered, ctx.ops, {
      previous,
      nextAesFirst: nextAesFirst[index],
    });
    const effects = effectsOf(ctx, bank, profile, listed, span);
    walk.instructions.push(
      buildInstruction(
        listed,
        span,
        effects,
        coversRefs(profile, covered),
        profile.note?.(listing.instructions, index),
      ),
    );
    if (effects.registerWrites.length > 0)
      walk.steps.push({ align: span, writes: effects.registerWrites });
    previous = span;
  });
  return walk;
}

/** The vector registers a listing uses, by register number. */
export function listingRegisters(profile: IsaProfile, listing: Listing): RegisterSpec[] {
  return vectorRegisterSpecs(
    listing.instructions.flatMap((instruction) => vectorRegisters(profile, instruction)),
    VECTOR_BITS,
    profile.lanes,
  );
}

/** Derives `instructions@<variant>` and `registers@<variant>` for an AES op-detail bundle. */
export function deriveIsaFacets(
  bundle: TraceBundle,
  profile: IsaProfile,
): Partial<Record<FacetKey, unknown>> {
  const ctx = traceContext(bundle);
  const listing = listingForRounds(profile.listings, ctx.ops.rounds);
  return isaFacetPair(
    profile,
    listing,
    walkListing(ctx, profile, listing),
    listingRegisters(profile, listing),
  );
}
