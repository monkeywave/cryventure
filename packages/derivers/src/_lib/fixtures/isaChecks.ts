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

/** Core validator and `alignIssues` problems of both facets against the bundle's state steps. */
export function isaFacetProblems(facets: IsaFacets, bundle: TraceBundle): string[] {
  const stepCount = getFacet<AnyStateFacet>(bundle, 'state')!.steps.length;
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
export function registerAfter(facets: IsaFacets, instructionIndex: number, register: string): number[] {
  const instruction = facets.instructions.instructions[instructionIndex]!;
  return registersAt(facets.registers, instruction.align.last).get(register) ?? [];
}

/**
 * Mnemonics of the AES-math instructions (those with `covers`) that are current at no playhead:
 * a following load or `ret` would shadow them, since `currentAt` picks the last match (§1e).
 */
export function aesInstructionsNeverCurrent(facets: IsaFacets, bundle: TraceBundle): string[] {
  const stepCount = getFacet<AnyStateFacet>(bundle, 'state')!.steps.length;
  const spans = facets.instructions.instructions.map((instruction) => instruction.align);
  const current = new Set(
    Array.from({ length: stepCount + 1 }, (_, index) => currentAt(spans, index - 1)),
  );
  return facets.instructions.instructions.flatMap((instruction, index) =>
    instruction.covers !== undefined && !current.has(index)
      ? [`${index}:${instruction.mnemonic}`]
      : [],
  );
}
