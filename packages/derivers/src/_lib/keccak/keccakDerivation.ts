import type { FacetKey, I18nRef, OperandRef, TraceBundle } from '@cryventure/core';
import {
  buildInstruction,
  listingError,
  listingFacetPair,
  namingErrors,
  recordInstruction,
  registerWrite,
  semanticsOf,
  type RunningIsaWalk,
  type VectorIsa,
} from '../isaFacets.ts';
import { INITIAL_SPAN } from '../isaSpans.ts';
import type { KeccakListing, KeccakListingInstruction } from '../listing.ts';
import { naturalSpan, resolveSpans } from './keccakSpans.ts';
import {
  keccakTrace,
  laneXY,
  type KeccakPermutation,
  type KeccakRoundSteps,
  type KeccakTrace,
} from './keccakTrace.ts';
import { KeccakRegisterFile, registerBytes, type KeccakRegister } from './keccakValues.ts';

/**
 * Turns the precomputed Keccak-f[1600] listing (prologue, a loop body of one round, epilogue) into
 * `instructions@<variant>` and `registers@<variant>` (docs/M6.md §5): the function runs once per
 * permutation, its body once per round. The ISA profile says what each instruction does to the
 * **symbolic** register file (`keccakValues.ts`, references into the trace); this walker places the
 * instructions on the sponge steps (`keccakSpans.ts`) and reads every register byte from the trace.
 */

/** What one instruction reads and writes, and the registers (and stack slots) it leaves with new contents. */
export interface KeccakEffects {
  reads: OperandRef[];
  writes: OperandRef[];
  written: { reg: string; content: KeccakRegister }[];
  /** Stack slots (byte offsets from `sp`) a spill writes. */
  spilled?: { offset: number; content: KeccakRegister }[];
  /** Registers reloaded from the caller's save area: their values are not in the trace. */
  restored?: string[];
}

export const NO_EFFECTS: KeccakEffects = { reads: [], writes: [], written: [] };

/** What an ISA profile's semantics see while the listing runs over one permutation. */
export interface KeccakMachine {
  /** The symbolic registers and stack before the instruction (read only: the walker applies the effects). */
  registers: Pick<KeccakRegisterFile, 'read' | 'readStack'>;
  trace: Pick<KeccakTrace, 'rhoOffsets' | 'piSource'>;
  permutation: KeccakPermutation;
  /** The round of the loop iteration (body instructions only). */
  round: number | undefined;
}

/** What one mnemonic does to the symbolic registers; throws when its sources hold something unexpected. */
export type KeccakSemantics = (
  instruction: KeccakListingInstruction,
  machine: KeccakMachine,
) => KeccakEffects;

/** A Keccak ISA deriver: its names, its listing, and the semantics of its instructions. */
export interface KeccakIsaProfile extends VectorIsa {
  lanes: number[];
  listing: KeccakListing;
  semantics: Readonly<Record<string, KeccakSemantics>>;
  /** An optional note on the instruction at `index` of the listing. */
  note?(instructions: readonly KeccakListingInstruction[], index: number): I18nRef | undefined;
}

/** The round a body instruction runs in; throws outside the loop. */
export function requiredRound(machine: Pick<KeccakMachine, 'round'>): number {
  if (machine.round === undefined) throw new Error('a round instruction outside the loop body');
  return machine.round;
}

/** The sponge steps of the round a body instruction runs in; throws outside the loop. */
export function roundSteps(
  machine: Pick<KeccakMachine, 'round' | 'permutation'>,
): KeccakRoundSteps {
  return machine.permutation.rounds[requiredRound(machine)]!;
}

/** The listing's three parts, by the loop's addresses. */
export interface KeccakListingParts {
  prologue: KeccakListingInstruction[];
  body: KeccakListingInstruction[];
  epilogue: KeccakListingInstruction[];
}

export function listingParts(listing: KeccakListing): KeccakListingParts {
  const { instructions, loop } = listing;
  const first = instructions.findIndex((instruction) => instruction.address === loop.first);
  const last = instructions.findIndex((instruction) => instruction.address === loop.last);
  if (first === -1 || last < first)
    throw new Error(`listing: no loop ${loop.first} … ${loop.last}`);
  return {
    prologue: instructions.slice(0, first),
    body: instructions.slice(first, last + 1),
    epilogue: instructions.slice(last + 1),
  };
}

/**
 * The chips of an instruction (`deriver.<id>.covers.*`): which round and which θ intermediate, lane
 * or constant it produces. Lanes are named (x, y) as in FIPS 202.
 */
export function keccakCovers(
  deriverId: string,
  instruction: KeccakListingInstruction,
  machine: Pick<KeccakMachine, 'round' | 'trace'>,
): I18nRef[] {
  const namespace = `deriver.${deriverId}.covers`;
  const { round } = machine;
  if (round === undefined) return [];
  const { role, x, half, lane } = instruction;
  if (role === 'thetaParity' && x !== undefined)
    return [
      { key: `${namespace}.${half === 1 ? 'parityPartial' : 'parity'}`, params: { round, x } },
    ];
  if (role === 'thetaD' && x !== undefined)
    return [{ key: `${namespace}.d`, params: { round, x } }];
  if (role === 'thetaRhoPi' && lane !== undefined) {
    const source = laneXY(machine.trace.piSource[lane]!);
    const target = laneXY(lane);
    const params = { round, sx: source.x, sy: source.y, x: target.x, y: target.y };
    return [{ key: `${namespace}.thetaRhoPi`, params }];
  }
  if (role === 'chi' && lane !== undefined)
    return [{ key: `${namespace}.chi`, params: { round, ...laneXY(lane) } }];
  if (role === 'iota' || role === 'loadRc')
    return [{ key: `${namespace}.${role}`, params: { round } }];
  return [];
}

/** One instruction the walk runs: the listed one, its listing index, its round (body only). */
interface RunItem {
  listed: KeccakListingInstruction;
  index: number;
  round: number | undefined;
}

/** Prologue, the body once per round, epilogue: one call of the function, with listing indices. */
function permutationRun(parts: KeccakListingParts, rounds: number): RunItem[] {
  const bodyStart = parts.prologue.length;
  const epilogueStart = bodyStart + parts.body.length;
  const items = (listed: readonly KeccakListingInstruction[], start: number, round?: number) =>
    listed.map((instruction, at) => ({ listed: instruction, index: start + at, round }));
  return [
    ...items(parts.prologue, 0),
    ...Array.from({ length: rounds }, (_, round) => items(parts.body, bodyStart, round)).flat(),
    ...items(parts.epilogue, epilogueStart),
  ];
}

function applyEffects(registers: KeccakRegisterFile, effects: KeccakEffects): void {
  effects.written.forEach(({ reg, content }) => registers.write(reg, content));
  effects.spilled?.forEach(({ offset, content }) => registers.writeStack(offset, content));
  effects.restored?.forEach((reg) => registers.forget(reg));
}

interface WalkContext {
  trace: KeccakTrace;
  profile: KeccakIsaProfile;
  parts: KeccakListingParts;
  notes: (I18nRef | undefined)[];
}

/** Runs the function over one permutation with a fresh register file, appending to `walk`. */
function walkPermutation(
  context: WalkContext,
  permutation: KeccakPermutation,
  walk: RunningIsaWalk,
): void {
  const { trace, profile, parts, notes } = context;
  const run = permutationRun(parts, trace.sponge.rounds);
  const spans = resolveSpans(
    run.map(({ listed, round }) =>
      naturalSpan(
        listed.role,
        permutation,
        round === undefined ? undefined : permutation.rounds[round],
      ),
    ),
    walk.previous,
  );
  const registers = new KeccakRegisterFile();
  run.forEach(({ listed, index, round }, position) => {
    const machine: KeccakMachine = { registers, trace, permutation, round };
    const effects = namingErrors(listed, () =>
      semanticsOf(profile.semantics, listed.mnemonic)(listed, machine),
    );
    applyEffects(registers, effects);
    const covers = keccakCovers(profile.deriverId, listed, machine);
    const instruction = buildInstruction(listed, spans[position]!, effects, covers, notes[index]);
    const writes = effects.written.map(({ reg, content }) =>
      registerWrite(reg, registerBytes(trace, content)),
    );
    recordInstruction(walk, instruction, writes.length > 0 ? writes : undefined);
  });
  walk.previous = spans.at(-1) ?? walk.previous;
}

/** The profile's note on instruction `index`; a failure names the instruction (index and address). */
function noteOf(
  profile: KeccakIsaProfile,
  instructions: readonly KeccakListingInstruction[],
  index: number,
): I18nRef | undefined {
  try {
    return profile.note?.(instructions, index);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw listingError(instructions[index]!, `note of instruction ${index}: ${message}`);
  }
}

/** Derives `instructions@<variant>` and `registers@<variant>` for a Keccak-f[1600] bundle at mapping detail. */
export function deriveKeccakIsaFacets(
  bundle: TraceBundle,
  profile: KeccakIsaProfile,
): Partial<Record<FacetKey, unknown>> {
  const trace = keccakTrace(bundle);
  const { listing } = profile;
  if (listing.loop.iterations !== trace.sponge.rounds)
    throw new Error(
      `listing: the loop runs ${listing.loop.iterations} rounds, the trace has ${trace.sponge.rounds}`,
    );
  const notes = listing.instructions.map((_, index) =>
    noteOf(profile, listing.instructions, index),
  );
  const context = { trace, profile, parts: listingParts(listing), notes };
  const walk: RunningIsaWalk = { instructions: [], steps: [], previous: INITIAL_SPAN };
  trace.permutations.forEach((permutation) => walkPermutation(context, permutation, walk));
  return listingFacetPair(profile, listing, walk);
}
