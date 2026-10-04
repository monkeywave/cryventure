import {
  facetKey,
  type FacetKey,
  type Instruction,
  type InstructionsFacet,
  type OperandRef,
  type RegisterSpec,
  type RegisterStep,
  type RegisterWrite,
  type RegistersFacet,
} from '@cryventure/core';
import { listingSource, type Listing } from './listing.ts';
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

/** What a listing walk produced: the instructions and the register writes per instruction. */
export interface IsaWalk {
  instructions: Instruction[];
  steps: RegisterStep[];
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
