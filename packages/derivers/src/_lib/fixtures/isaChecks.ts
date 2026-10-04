import {
  alignIssues,
  currentAt,
  getFacet,
  registersAt,
  validateInstructionsFacet,
  validateRegistersFacet,
  type AnyStateFacet,
  type FacetKey,
  type InstructionsFacet,
  type RegistersFacet,
  type TraceBundle,
  type ValuesFacet,
} from '@cryventure/core';

/** Test-only helpers shared by the ISA deriver tests. */

type FacetInstruction = InstructionsFacet['instructions'][number];

export interface IsaFacets {
  instructions: InstructionsFacet;
  registers: RegistersFacet;
}

/** The two facets of one variant out of `derive()`'s result. */
export function isaFacets(derived: Partial<Record<FacetKey, unknown>>, variant: string): IsaFacets {
  return {
    instructions: derived[`instructions@${variant}`] as InstructionsFacet,
    registers: derived[`registers@${variant}`] as RegistersFacet,
  };
}

/** The number of steps of the bundle's state facet. */
export function stateStepCount(bundle: TraceBundle): number {
  return getFacet<AnyStateFacet>(bundle, 'state')!.steps.length;
}

/** Core validator and `alignIssues` problems of both facets against the bundle's state steps. */
export function isaFacetProblems(facets: IsaFacets, bundle: TraceBundle): string[] {
  const stepCount = stateStepCount(bundle);
  return [
    ...validateInstructionsFacet(facets.instructions),
    ...validateRegistersFacet(facets.registers),
    ...alignIssues(
      facets.instructions.instructions.map((instruction) => instruction.align),
      stepCount,
    ),
    ...alignIssues(
      facets.registers.steps.map((step) => step.align),
      stepCount,
    ),
  ];
}

/** Every `valueRef` in the facets that the bundle's values facet does not declare. */
export function unknownValueRefs(facets: IsaFacets, bundle: TraceBundle): string[] {
  const known = new Set(getFacet<ValuesFacet>(bundle, 'values')!.values.map((value) => value.id));
  const operands = facets.instructions.instructions.flatMap((instruction) => [
    ...instruction.reads,
    ...instruction.writes,
  ]);
  const writes = facets.registers.steps.flatMap((step) => step.writes);
  return [...operands, ...writes]
    .map((ref) => ref.valueRef)
    .filter((id): id is string => id !== undefined && !known.has(id));
}

/** The bytes `register` holds after the registers step aligned like `instructionIndex`, replayed via core `registersAt`; [] if unwritten. */
export function registerAfter(
  facets: IsaFacets,
  instructionIndex: number,
  register: string,
): number[] {
  const instruction = facets.instructions.instructions[instructionIndex]!;
  return registersAt(facets.registers, instruction.align.last).get(register) ?? [];
}

/** Instructions with `covers` (AES math, SHA rounds and schedule). */
export const hasCovers = (instruction: FacetInstruction): boolean =>
  instruction.covers !== undefined;

/**
 * `index:mnemonic` of the instructions matching `predicate` that are current at no playhead: a
 * following zero-width instruction (a load, `ret`) would shadow them, since `currentAt` picks the
 * last match (§1e).
 */
export function instructionsNeverCurrent(
  facets: IsaFacets,
  bundle: TraceBundle,
  predicate: (instruction: FacetInstruction) => boolean,
): string[] {
  const spans = facets.instructions.instructions.map((instruction) => instruction.align);
  const current = new Set(
    Array.from({ length: stateStepCount(bundle) + 1 }, (_, index) => currentAt(spans, index - 1)),
  );
  return facets.instructions.instructions.flatMap((instruction, index) =>
    predicate(instruction) && !current.has(index) ? [`${index}:${instruction.mnemonic}`] : [],
  );
}

/** Indices of the instructions with `mnemonic`. */
export function indicesOf(facets: IsaFacets, mnemonic: string): number[] {
  return facets.instructions.instructions.flatMap((instruction, index) =>
    instruction.mnemonic === mnemonic ? [index] : [],
  );
}

/**
 * The bytes instruction `index` writes to `register`, from its own registers step (a playhead replay
 * would also apply later zero-width writes on the same step, e.g. the K+W `paddd` after the last msg2).
 * Throws unless that step is aligned like the instruction.
 */
export function writtenBy(facets: IsaFacets, index: number, register: string): number[] {
  const writesRegister = (instruction: FacetInstruction) =>
    instruction.writes.some((ref) => ref.kind === 'reg');
  const instructions = facets.instructions.instructions;
  const step = facets.registers.steps[instructions.slice(0, index).filter(writesRegister).length]!;
  const align = instructions[index]!.align;
  if (step.align.first !== align.first || step.align.last !== align.last)
    throw new Error(`instruction ${index} has no registers step of its own`);
  return step.writes.find((write) => write.reg === register)?.bytes ?? [];
}
