import type {
  AlignSpan,
  FacetKey,
  I18nRef,
  Instruction,
  OperandRef,
  TraceBundle,
} from '@cryventure/core';
import {
  isaFacetPair,
  registerWrite,
  vectorRegisterSpecs,
  type IsaVariant,
  type IsaWalk,
} from '../isaFacets.ts';
import { INITIAL_SPAN } from '../isaSpans.ts';
import type { ShaListing, ShaListingInstruction } from '../listing.ts';
import { registerBytes, ShaRegisterFile, type ShaBlockContext } from './shaRegisters.ts';
import { blockSpans, isRoundInstruction, nextRoundStarts, requiredShaRound } from './shaSpans.ts';
import { chainingValueId, shaTrace, type ShaTrace } from './shaTrace.ts';
import type { Lanes } from './shaWords.ts';

/**
 * Turns a precomputed SHA-256 compression listing into `instructions@<variant>` and
 * `registers@<variant>` (docs/M5.md §5). The listing runs once per block. The ISA profile says what
 * each instruction does to the **symbolic** register file (lane words, `shaWords.ts`); this walker
 * aligns the instructions (`shaSpans.ts`) and reads every register byte from the trace.
 */

/** What one instruction reads and writes, and the registers it leaves with new lane words. */
export interface ShaEffects {
  reads: OperandRef[];
  writes: OperandRef[];
  written: { reg: string; lanes: Lanes; valueRef?: string }[];
}

/** What an ISA profile's `execute` sees while the listing runs over one block. */
export interface ShaMachine {
  /** The symbolic register file before the instruction (read only: the walker applies `written`). */
  registers: Pick<ShaRegisterFile, 'read'>;
  /** The first round t of the next round instruction (K_t … for a W+K load); `undefined` after the last one. */
  nextRound: number | undefined;
  /** Value id of the chaining value the block reads: `iv` or `h/<n>`. */
  chainIn: string;
  /** Value id of the chaining value the block stores: `h/<n+1>`. */
  chainOut: string;
}

/** A SHA ISA deriver: its names, its listing, and the semantics of its instructions on lane words. */
export interface ShaIsaProfile extends IsaVariant {
  /** Lane widths the vector registers offer, e.g. [8, 16, 32, 64]. */
  lanes: number[];
  registerBits: number;
  listing: ShaListing;
  /** Rounds per round instruction: 2 (`sha256rnds2`), 4 (`sha256h`/`sha256h2`). */
  roundsPerInstruction: number;
  /** Canonical vector register name of an operand (`q1`, `v1.4s` → `v1`), or `undefined`. */
  vectorRegister(operand: string): string | undefined;
  /** The instruction's effect on the symbolic registers; throws when its sources hold something unexpected. */
  execute(instruction: ShaListingInstruction, machine: ShaMachine): ShaEffects;
  /** An optional note on the instruction at `index`. */
  note?(instructions: readonly ShaListingInstruction[], index: number): I18nRef | undefined;
}

function listingError(instruction: ShaListingInstruction, error: unknown): Error {
  const message = error instanceof Error ? error.message : String(error);
  return new Error(`listing ${instruction.address} ${instruction.mnemonic}: ${message}`);
}

/**
 * The chips of an instruction (`deriver.<id>.covers.*`): the rounds of a round instruction, the
 * schedule words W_first … W_last a message instruction works on.
 */
export function shaCovers(
  profile: Pick<ShaIsaProfile, 'deriverId' | 'roundsPerInstruction'>,
  instruction: ShaListingInstruction,
): I18nRef[] {
  const namespace = `deriver.${profile.deriverId}.covers`;
  if (isRoundInstruction(instruction)) {
    const first = requiredShaRound(instruction);
    const last = first + profile.roundsPerInstruction - 1;
    return [{ key: `${namespace}.rounds`, params: { first, last } }];
  }
  const { role, w } = instruction;
  if ((role === 'msg1' || role === 'msg2') && w !== undefined)
    return [{ key: `${namespace}.${role}`, params: { first: w, last: w + 3 } }];
  return [];
}

function buildInstruction(
  listed: ShaListingInstruction,
  align: AlignSpan,
  effects: ShaEffects,
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

/** Static per-listing data, shared by every block. */
interface ListingPlan {
  nextRound: (number | undefined)[];
  covers: I18nRef[][];
  notes: (I18nRef | undefined)[];
}

function planListing(profile: ShaIsaProfile): ListingPlan {
  const { instructions } = profile.listing;
  return {
    nextRound: nextRoundStarts(instructions),
    covers: instructions.map((instruction) => shaCovers(profile, instruction)),
    notes: instructions.map((_, index) => profile.note?.(instructions, index)),
  };
}

/** Runs `profile.execute`, naming the instruction in any error it throws. */
function execute(
  profile: ShaIsaProfile,
  listed: ShaListingInstruction,
  machine: ShaMachine,
): ShaEffects {
  try {
    return profile.execute(listed, machine);
  } catch (error) {
    throw listingError(listed, error);
  }
}

/** The spans of block `blockIndex` after the span before it (§5c). */
function spansOfBlock(
  trace: ShaTrace,
  profile: ShaIsaProfile,
  blockIndex: number,
  previous: AlignSpan,
): AlignSpan[] {
  const block = trace.blocks[blockIndex]!;
  const isLast = blockIndex === trace.blocks.length - 1;
  const timeline = {
    block,
    storeStep: isLast ? trace.output : block.feedForward,
    roundsPerInstruction: profile.roundsPerInstruction,
  };
  return blockSpans(profile.listing.instructions, timeline, previous);
}

/** Runs the listing over block `blockIndex` with a fresh register file, appending to `walk`. */
function walkBlock(
  trace: ShaTrace,
  profile: ShaIsaProfile,
  plan: ListingPlan,
  blockIndex: number,
  walk: IsaWalk & { previous: AlignSpan },
): void {
  const context: ShaBlockContext = { trace, block: trace.blocks[blockIndex]! };
  const spans = spansOfBlock(trace, profile, blockIndex, walk.previous);
  const registers = new ShaRegisterFile();
  const chainIn = chainingValueId(trace, blockIndex);
  const chainOut = chainingValueId(trace, blockIndex + 1);
  profile.listing.instructions.forEach((listed, index) => {
    const align = spans[index]!;
    const nextRound = plan.nextRound[index];
    const effects = execute(profile, listed, { registers, nextRound, chainIn, chainOut });
    effects.written.forEach(({ reg, lanes }) => registers.write(reg, lanes));
    walk.instructions.push(
      buildInstruction(listed, align, effects, plan.covers[index]!, plan.notes[index]),
    );
    if (effects.written.length > 0)
      walk.steps.push({
        align,
        writes: effects.written.map(({ reg, lanes, valueRef }) =>
          registerWrite(reg, registerBytes(context, lanes), valueRef),
        ),
      });
  });
  walk.previous = spans.at(-1) ?? walk.previous;
}

/** Derives `instructions@<variant>` and `registers@<variant>` for a SHA-224/256 round-detail bundle. */
export function deriveShaIsaFacets(
  bundle: TraceBundle,
  profile: ShaIsaProfile,
): Partial<Record<FacetKey, unknown>> {
  const trace = shaTrace(bundle);
  const plan = planListing(profile);
  const walk = { instructions: [], steps: [], previous: INITIAL_SPAN };
  trace.blocks.forEach((_, blockIndex) => walkBlock(trace, profile, plan, blockIndex, walk));
  const names = profile.listing.instructions.flatMap((instruction) =>
    instruction.operands.flatMap((operand) => profile.vectorRegister(operand) ?? []),
  );
  return isaFacetPair(
    profile,
    profile.listing,
    { instructions: walk.instructions, steps: walk.steps },
    vectorRegisterSpecs(names, profile.registerBits, profile.lanes),
  );
}
