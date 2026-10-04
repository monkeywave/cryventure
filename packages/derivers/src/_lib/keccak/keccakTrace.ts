import type { AnyStateFacet, SpongeFacet, SpongeStep, TraceBundle } from '@cryventure/core';
import { memoizePerBundle, requiredFacet, traceContractError } from '../traceFacets.ts';

/**
 * The `sponge` facet contract the Keccak ISA deriver reads (docs/M6.md §3a, §5c): Keccak-f[1600]
 * at `mapping` detail, i.e. every permutation as 24 rounds of the five step mappings θ, ρ, π, χ, ι,
 * each one sponge step. A permutation is entered from the step before its first θ (an `absorb`, or
 * a `squeeze` before a further squeeze) and left to the step after its last ι.
 */

export const KECCAK_CONTRACT = 'Keccak';

/** The five step mappings of one round, in order. */
export const ROUND_PHASES = ['theta', 'rho', 'pi', 'chi', 'iota'] as const;
export type KeccakRoundPhase = (typeof ROUND_PHASES)[number];

/** Keccak-f[1600]: 5 × 5 lanes of 64 bits. */
export const KECCAK_WIDTH = 5;
export const KECCAK_LANES = KECCAK_WIDTH * KECCAK_WIDTH;
export const KECCAK_LANE_BITS = 64;
export const KECCAK_LANE_BYTES = KECCAK_LANE_BITS / 8;

/** The sponge steps of one round. */
export type KeccakRoundSteps = Record<KeccakRoundPhase, SpongeStep>;

/** One permutation: the step it starts from, its rounds, and the step that reads its result. */
export interface KeccakPermutation {
  /** The state step before the first θ (its lanes are the permutation's input). */
  entry: number;
  rounds: KeccakRoundSteps[];
  /** The state step after the last ι (the next `absorb` or a `squeeze`). */
  exit: number;
}

export interface KeccakTrace {
  sponge: SpongeFacet;
  stepCount: number;
  rhoOffsets: readonly number[];
  piSource: readonly number[];
  permutations: KeccakPermutation[];
  /** The sponge step recorded at a state step. */
  byStep: ReadonlyMap<number, SpongeStep>;
}

const fail = (message: string): Error => traceContractError(KECCAK_CONTRACT, message);

function checkShape(sponge: SpongeFacet): { rhoOffsets: number[]; piSource: number[] } {
  if (sponge.width !== KECCAK_WIDTH || sponge.height !== KECCAK_WIDTH)
    throw fail(`expected 5 × 5 lanes, got ${sponge.width} × ${sponge.height}`);
  if (sponge.laneBits !== KECCAK_LANE_BITS)
    throw fail(`expected 64-bit lanes, got ${sponge.laneBits}`);
  if (sponge.rhoOffsets === undefined || sponge.piSource === undefined)
    throw fail('no rhoOffsets or piSource');
  return { rhoOffsets: sponge.rhoOffsets, piSource: sponge.piSource };
}

/** The round steps starting at `steps[start]`; throws unless they are θ, ρ, π, χ, ι of round `round`, with θ and ι data. */
function readRound(steps: readonly SpongeStep[], start: number, round: number): KeccakRoundSteps {
  const entries = ROUND_PHASES.map((phase, offset) => {
    const step = steps[start + offset];
    if (step?.phase !== phase || step.round !== round)
      throw fail(`expected ${phase} of round ${round} at sponge step ${start + offset}`);
    return [phase, step] as const;
  });
  const mapped = Object.fromEntries(entries) as KeccakRoundSteps;
  if (mapped.theta.theta?.partial === undefined)
    throw fail(`θ of round ${round} has no theta.partial`);
  if (mapped.iota.iota === undefined) throw fail(`ι of round ${round} has no iota.rc`);
  return mapped;
}

/** The permutation whose first θ is `steps[start]`. */
function readPermutation(
  steps: readonly SpongeStep[],
  start: number,
  rounds: number,
): KeccakPermutation {
  const before = steps[start - 1];
  const after = steps[start + rounds * ROUND_PHASES.length];
  if (before === undefined) throw fail('a permutation starts before any absorb');
  if (after === undefined) throw fail('nothing reads the last permutation');
  return {
    entry: before.step,
    rounds: Array.from({ length: rounds }, (_, round) =>
      readRound(steps, start + round * ROUND_PHASES.length, round),
    ),
    exit: after.step,
  };
}

function readPermutations(sponge: SpongeFacet): KeccakPermutation[] {
  const permutations: KeccakPermutation[] = [];
  for (let index = 0; index < sponge.steps.length; index++) {
    const step = sponge.steps[index]!;
    if (step.phase !== 'theta' || step.round !== 0) continue;
    permutations.push(readPermutation(sponge.steps, index, sponge.rounds));
    index += sponge.rounds * ROUND_PHASES.length - 1;
  }
  if (permutations.length === 0) throw fail('no permutation at mapping detail');
  return permutations;
}

function readKeccakTrace(bundle: TraceBundle): KeccakTrace {
  const sponge = requiredFacet<SpongeFacet>(bundle, 'sponge', KECCAK_CONTRACT);
  const stepCount = requiredFacet<AnyStateFacet>(bundle, 'state', KECCAK_CONTRACT).steps.length;
  const lastStep = sponge.steps.at(-1)?.step ?? -1;
  if (lastStep >= stepCount) throw fail(`sponge step ${lastStep} beyond ${stepCount} state steps`);
  return {
    sponge,
    stepCount,
    ...checkShape(sponge),
    permutations: readPermutations(sponge),
    byStep: new Map(sponge.steps.map((step) => [step.step, step])),
  };
}

/** The bundle's Keccak trace, read once per bundle; throws on a broken sponge contract. */
export const keccakTrace: (bundle: TraceBundle) => KeccakTrace = memoizePerBundle(readKeccakTrace);

/** The sponge step at state step `step`; throws when there is none. */
export function spongeStepAt(trace: Pick<KeccakTrace, 'byStep'>, step: number): SpongeStep {
  const found = trace.byStep.get(step);
  if (found === undefined) throw fail(`no sponge step at state step ${step}`);
  return found;
}

/** Lane (x, y) → index x + 5y. */
export const laneIndex = (x: number, y: number): number =>
  (((x % KECCAK_WIDTH) + KECCAK_WIDTH) % KECCAK_WIDTH) + KECCAK_WIDTH * y;

/** Index → lane (x, y). */
export const laneXY = (lane: number): { x: number; y: number } => ({
  x: lane % KECCAK_WIDTH,
  y: Math.floor(lane / KECCAK_WIDTH),
});

/**
 * The 8 bytes of a lane integer (16 hex digits, MSB first) in memory order: little-endian, as
 * FIPS 202 Appendix B stores a lane and as it sits in the low half of a vector register.
 */
export function laneBytes(hex: string): number[] {
  if (!/^[0-9a-f]{16}$/.test(hex)) throw fail(`"${hex}" is not a 64-bit lane`);
  return Array.from({ length: KECCAK_LANE_BYTES }, (_, index) =>
    Number.parseInt(hex.slice(14 - 2 * index, 16 - 2 * index), 16),
  );
}
