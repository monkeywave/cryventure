import type { I18nRef } from '../i18n.ts';
import { describeValue, i18nRefProblems, INITIAL_STEP_INDEX, isIndex, isLowerHex, isPlainRecord, isStepIndex, kindProblems, stepCountProblems } from './validation.ts';

/**
 * Sponge facet (docs/M6.md §3a): the lanes of a permutation state after each sponge step — Keccak-f
 * (5 × 5 lanes of 64 bits, FIPS 202), Keccak-p[1600, 12], later Ascon (5 × 1). Lane `x + width·y` is
 * column x, row y. Lanes are integers written as `laneBits / 4` lowercase hex digits, MSB first;
 * byte strings (`output`) are hex in byte order.
 */

export type SpongePhase = 'pad' | 'absorb' | 'theta' | 'rho' | 'pi' | 'chi' | 'iota' | 'round' | 'permute' | 'squeeze' | 'output';

export type SpongeLaneBits = 8 | 16 | 32 | 64;

export interface SpongeStep {
  /** State-facet step index (−1 = the initial state), strictly increasing. */
  step: number;
  phase: SpongePhase;
  /** 0 … rounds−1 for the round phases. */
  round?: number;
  /** All `width·height` lanes after the step. */
  lanes: string[];
  /** absorb: the `rateLanes` lanes XORed in. */
  input?: string[];
  /** squeeze/output: the bytes read out, hex in byte order. */
  output?: string;
  /**
   * θ: the column parities C[x], the D[x] = C[x−1] ⊕ ROT(C[x+1], 1), and optionally `partial[x]` =
   * A[x,0] ⊕ A[x,1] ⊕ A[x,2] (what a three-input XOR holds after its first step); `width` entries each.
   */
  theta?: { c: string[]; d: string[]; partial?: string[] };
  /** ι: the round constant XORed into lane 0. */
  iota?: { rc: string };
}

export interface SpongeFacet {
  kind: 'sponge';
  schemaVersion: 1;
  /** E.g. 'Keccak-f[1600]'. */
  label: I18nRef;
  /** Lanes per row and rows; lane index = x + width·y. */
  width: number;
  height: number;
  laneBits: SpongeLaneBits;
  /** Rounds per permutation, e.g. 24. */
  rounds: number;
  /** Lanes 0 … rateLanes−1 (index order) are the rate, the rest the capacity. */
  rateLanes: number;
  /** Per lane index: the ρ left-rotation amount. */
  rhoOffsets?: number[];
  /** Per lane index: after π, lane i holds what lane piSource[i] held. */
  piSource?: number[];
  steps: SpongeStep[];
}

const SPONGE_PHASES: readonly unknown[] = ['pad', 'absorb', 'theta', 'rho', 'pi', 'chi', 'iota', 'round', 'permute', 'squeeze', 'output'];
const ROUND_PHASES: readonly unknown[] = ['theta', 'rho', 'pi', 'chi', 'iota', 'round'];
const LANE_BITS: readonly unknown[] = [8, 16, 32, 64];

const isPositiveInteger = (value: unknown): value is number => typeof value === 'number' && Number.isInteger(value) && value > 0;

/** What every step check needs from the (already shape-checked) facet. */
interface SpongeShape {
  laneCount: number;
  width: number;
  digits: number;
  rounds: number;
  rateLanes: number;
}

/** `words` is an array of `count` lane words. */
function laneListProblems(words: unknown, count: number, digits: number, where: string): string[] {
  if (!Array.isArray(words)) return [`${where} is not an array`];
  const problems = words.length === count ? [] : [`${where} has ${words.length} lanes, expected ${count}`];
  return [...problems, ...words.flatMap((word: unknown, index) => (isLowerHex(word, digits) ? [] : [`${where}[${index}] "${describeValue(word)}" is not ${digits} lowercase hex digits`]))];
}

function thetaProblems(theta: unknown, shape: SpongeShape, where: string): string[] {
  if (theta === undefined) return [];
  if (!isPlainRecord(theta)) return [`${where}: theta is not an object`];
  const parts = theta.partial === undefined ? (['c', 'd'] as const) : (['c', 'd', 'partial'] as const);
  return parts.flatMap((part) => laneListProblems(theta[part], shape.width, shape.digits, `${where}: theta.${part}`));
}

function iotaProblems(iota: unknown, shape: SpongeShape, where: string): string[] {
  if (iota === undefined) return [];
  if (!isPlainRecord(iota)) return [`${where}: iota is not an object`];
  return isLowerHex(iota.rc, shape.digits) ? [] : [`${where}: iota.rc "${describeValue(iota.rc)}" is not ${shape.digits} lowercase hex digits`];
}

function outputProblems(output: unknown, where: string): string[] {
  if (output === undefined) return [];
  const isByteHex = typeof output === 'string' && output.length % 2 === 0 && /^[0-9a-f]*$/.test(output);
  return isByteHex ? [] : [`${where}: output "${describeValue(output)}" is not lowercase hex bytes`];
}

function roundProblems(step: Record<string, unknown>, shape: SpongeShape, where: string): string[] {
  const { round, phase } = step;
  if (round === undefined) return ROUND_PHASES.includes(phase) ? [`${where}: phase ${describeValue(phase)} has no round`] : [];
  return typeof round === 'number' && isIndex(round, shape.rounds) ? [] : [`${where}: round ${describeValue(round)} outside 0..${shape.rounds - 1}`];
}

function stepIndexProblems(step: unknown, previous: unknown, stepCount: number | undefined): string[] {
  if (typeof step !== 'number' || !isStepIndex(step)) return [`sponge: step ${describeValue(step)} is not an integer ≥ ${INITIAL_STEP_INDEX}`];
  const problems: string[] = [];
  if (typeof previous === 'number' && step <= previous) problems.push(`sponge: step ${step} does not increase (after ${previous})`);
  if (stepCount !== undefined && step > stepCount - 1) problems.push(`sponge: step ${step} outside ${INITIAL_STEP_INDEX}..${stepCount - 1}`);
  return problems;
}

function stepProblems(step: unknown, index: number, previous: unknown, shape: SpongeShape, stepCount: number | undefined): string[] {
  if (!isPlainRecord(step)) return [`sponge steps[${index}]: not an object`];
  const where = `sponge step ${describeValue(step.step)}`;
  return [
    ...stepIndexProblems(step.step, isPlainRecord(previous) ? previous.step : undefined, stepCount),
    ...(SPONGE_PHASES.includes(step.phase) ? [] : [`${where}: phase "${describeValue(step.phase)}" is not a SpongePhase`]),
    ...roundProblems(step, shape, where),
    ...laneListProblems(step.lanes, shape.laneCount, shape.digits, `${where}: lanes`),
    ...(step.input === undefined ? [] : laneListProblems(step.input, shape.rateLanes, shape.digits, `${where}: input`)),
    ...outputProblems(step.output, where),
    ...thetaProblems(step.theta, shape, where),
    ...iotaProblems(step.iota, shape, where),
  ];
}

function rhoProblems(rhoOffsets: unknown, laneCount: number, laneBits: number): string[] {
  if (rhoOffsets === undefined) return [];
  if (!Array.isArray(rhoOffsets) || rhoOffsets.length !== laneCount) return [`sponge: rhoOffsets is not an array of ${laneCount} offsets`];
  return rhoOffsets.flatMap((offset: unknown, index) => (typeof offset === 'number' && isIndex(offset, laneBits) ? [] : [`sponge: rhoOffsets[${index}] ${describeValue(offset)} outside 0..${laneBits - 1}`]));
}

function piProblems(piSource: unknown, laneCount: number): string[] {
  if (piSource === undefined) return [];
  const isPermutation = Array.isArray(piSource) && piSource.length === laneCount && piSource.every((source: unknown) => typeof source === 'number' && isIndex(source, laneCount)) && new Set(piSource).size === laneCount;
  return isPermutation ? [] : [`sponge: piSource is not a permutation of 0..${laneCount - 1}`];
}

/** The shape fields, or the problems that stop the step checks. */
function shapeOf(facet: Record<string, unknown>): SpongeShape | string[] {
  const { width, height, laneBits, rounds, rateLanes } = facet;
  const problems = (['width', 'height', 'rounds', 'rateLanes'] as const).filter((field) => !isPositiveInteger(facet[field])).map((field) => `sponge: ${field} ${describeValue(facet[field])} is not a positive integer`);
  if (!LANE_BITS.includes(laneBits)) problems.push(`sponge: laneBits ${describeValue(laneBits)} is not 8, 16, 32 or 64`);
  if (problems.length > 0) return problems;
  const laneCount = (width as number) * (height as number);
  if ((rateLanes as number) > laneCount) return [`sponge: rateLanes ${rateLanes as number} exceeds the ${laneCount} lanes`];
  return { laneCount, width: width as number, digits: (laneBits as number) / 4, rounds: rounds as number, rateLanes: rateLanes as number };
}

/**
 * Schema problems of a sponge facet (empty = valid); never throws, whatever `facet` is. Shape fields
 * are positive integers (`rateLanes` ≤ the lane count) and `laneBits` ∈ {8, 16, 32, 64}; `lanes`
 * has `width·height` entries of `laneBits / 4` lowercase hex digits; `input` has `rateLanes`
 * entries; `theta.*` have `width` entries; `output` is hex bytes; `rhoOffsets` in [0, laneBits);
 * `piSource` a permutation; `round` < `rounds` (and present on the round phases); steps strictly
 * increasing, in −1..stepCount−1 when `stepCount` is given; `label` a well-formed I18nRef.
 */
export function validateSpongeFacet(facet: unknown, stepCount?: number): string[] {
  if (!isPlainRecord(facet)) return ['sponge: facet is not an object'];
  const precondition = [...kindProblems(facet, 'sponge'), ...stepCountProblems(stepCount, 'sponge')];
  if (precondition.length > 0) return precondition;
  if (facet.schemaVersion !== 1) return [`sponge: schemaVersion ${describeValue(facet.schemaVersion)} is not 1`];
  const shape = shapeOf(facet);
  if (Array.isArray(shape)) return shape;
  const { steps } = facet;
  return [
    ...i18nRefProblems(facet.label, 'sponge label'),
    ...rhoProblems(facet.rhoOffsets, shape.laneCount, shape.digits * 4),
    ...piProblems(facet.piSource, shape.laneCount),
    ...(Array.isArray(steps) ? steps.flatMap((step: unknown, index) => stepProblems(step, index, steps[index - 1], shape, stepCount)) : ['sponge: steps is not an array']),
  ];
}
