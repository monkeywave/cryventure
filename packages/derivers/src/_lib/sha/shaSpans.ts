import type { AlignSpan } from '@cryventure/core';
import { nextFrom, pointSpan } from '../isaSpans.ts';
import type { ShaListingInstruction, ShaListingRole } from '../listing.ts';
import { roundStep, type ShaBlockSteps } from './shaTrace.ts';

/**
 * The spans of one block's listing (docs/M5.md §5c, docs/M4.md §1e). Round instructions cover their
 * rounds (`sha256rnds2` t … t+1, `sha256h`/`sha256h2` t … t+3). Everything else is zero-width:
 * state/block loads, packing and byte swaps before the first round instruction on the block's `init`;
 * feed-forward, unpacking and stores after the last one on `feedForward` (a store of the last block on
 * `output`); schedule, W+K and any shuffle the compiler moved between rounds on the **next** round
 * instruction's `first`; a register copy (`other`) on the point of the instruction it feeds.
 */

const SETUP_ROLES: ReadonlySet<ShaListingRole> = new Set([
  'loadState',
  'packState',
  'loadBlock',
  'byteSwap',
]);
const FINISH_ROLES: ReadonlySet<ShaListingRole> = new Set(['feedForward', 'unpackState', 'store']);
const ROUND_ROLES: ReadonlySet<ShaListingRole> = new Set(['rounds', 'rounds2']);

export function isRoundInstruction(instruction: ShaListingInstruction): boolean {
  return ROUND_ROLES.has(instruction.role);
}

/** The first round t a round instruction runs; throws when the listing has none. */
export function requiredShaRound(instruction: ShaListingInstruction): number {
  if (instruction.round === undefined)
    throw new Error(`listing ${instruction.address} ${instruction.mnemonic}: no round`);
  return instruction.round;
}

/** Per instruction, the first round t of the next round instruction after it (`undefined` after the last one). */
export function nextRoundStarts(
  instructions: readonly ShaListingInstruction[],
): (number | undefined)[] {
  return nextFrom(instructions, (instruction) =>
    isRoundInstruction(instruction) ? requiredShaRound(instruction) : undefined,
  );
}

/** Where the round instructions sit in a listing: the same for every block, so computed once. */
export interface ShaListingShape {
  /** Per instruction, whether it is a round instruction. */
  isRound: readonly boolean[];
  /** Index of the first round instruction. */
  firstRound: number;
  /** Index of the last round instruction. */
  lastRound: number;
  /** Per instruction, the first round t of the next round instruction after it (`undefined` after the last one). */
  nextRound: readonly (number | undefined)[];
}

/** The listing's shape; throws when it has no round instruction (or one without a round). */
export function listingShape(instructions: readonly ShaListingInstruction[]): ShaListingShape {
  const isRound = instructions.map(isRoundInstruction);
  const firstRound = isRound.indexOf(true);
  if (firstRound === -1) throw new Error('the listing has no round instruction');
  return {
    isRound,
    firstRound,
    lastRound: isRound.lastIndexOf(true),
    nextRound: nextRoundStarts(instructions),
  };
}

/** Where one block sits: its op steps and the step its final stores align to. */
export interface ShaBlockTimeline {
  block: ShaBlockSteps;
  /** `output` for the last block, else the block's `feedForward`. */
  storeStep: number;
  /** Rounds one round instruction runs (x86 2, ARMv8 4). */
  roundsPerInstruction: number;
}

function roundSpan(instruction: ShaListingInstruction, timeline: ShaBlockTimeline): AlignSpan {
  const t = requiredShaRound(instruction);
  return {
    first: roundStep(timeline.block, t),
    last: roundStep(timeline.block, t + timeline.roundsPerInstruction - 1),
  };
}

/** The zero-width target of a non-round, non-copy instruction, before the monotonic guard. */
function homeStep(
  instruction: ShaListingInstruction,
  phase: 'before' | 'between' | 'after',
  nextRoundFirst: number | undefined,
  timeline: ShaBlockTimeline,
): number {
  const { role } = instruction;
  if (phase === 'before' && SETUP_ROLES.has(role)) return timeline.block.init;
  if (phase === 'after' && FINISH_ROLES.has(role))
    return role === 'store' ? timeline.storeStep : timeline.block.feedForward;
  return nextRoundFirst ?? timeline.block.feedForward;
}

/** Copies (`other`) take the target (a round instruction's: its `first`) of the next instruction that is not a copy; trailing ones (`ret`) the one before. */
function resolveCopies(targets: (number | undefined)[]): number[] {
  const resolved = [...targets];
  for (let index = resolved.length - 2; index >= 0; index--)
    resolved[index] ??= resolved[index + 1];
  for (let index = 1; index < resolved.length; index++) resolved[index] ??= resolved[index - 1];
  return resolved.map((target) => {
    if (target === undefined) throw new Error('a listing of copies only has no span');
    return target;
  });
}

/**
 * The spans of one block's instructions, after `previous` (the span before the block). A zero-width
 * target behind the previous span's `last` (e.g. a move between `sha256h` and `sha256h2` of the same
 * rounds) takes the previous span, so spans never decrease.
 */
export function blockSpans(
  instructions: readonly ShaListingInstruction[],
  shape: ShaListingShape,
  timeline: ShaBlockTimeline,
  previous: AlignSpan,
): AlignSpan[] {
  const { isRound, firstRound, lastRound } = shape;
  const targets = resolveCopies(
    instructions.map((instruction, index) => {
      if (isRound[index]) return roundSpan(instruction, timeline).first;
      if (instruction.role === 'other') return undefined;
      const phase = index < firstRound ? 'before' : index > lastRound ? 'after' : 'between';
      const nextRound = shape.nextRound[index];
      const nextRoundFirst =
        nextRound === undefined ? undefined : roundStep(timeline.block, nextRound);
      return homeStep(instruction, phase, nextRoundFirst, timeline);
    }),
  );
  let last = previous;
  return instructions.map((instruction, index) => {
    const target = targets[index]!;
    if (isRound[index]) last = roundSpan(instruction, timeline);
    else if (target >= last.last) last = pointSpan(target);
    return last;
  });
}
