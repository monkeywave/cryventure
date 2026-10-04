import {
  facetKey,
  type AlignSpan,
  type FacetKey,
  type I18nRef,
  type OperandRef,
  type TraceBundle,
} from '@cryventure/core';
import {
  buildInstruction,
  isaFacetPair,
  listingError,
  registerWrite,
  vectorRegisterSpecs,
  type IsaVariant,
  type IsaWalk,
} from '../isaFacets.ts';
import { INITIAL_SPAN } from '../isaSpans.ts';
import type { ShaListing, ShaListingInstruction } from '../listing.ts';
import { registerBytes, ShaRegisterFile, type ShaBlockContext } from './shaRegisters.ts';
import {
  blockSpans,
  isRoundInstruction,
  listingShape,
  requiredShaRound,
  type ShaListingShape,
} from './shaSpans.ts';
import { chainingValueId, shaTrace, type ShaTrace } from './shaTrace.ts';
import { isTraced, LANE_COUNT, type Lanes } from './shaWords.ts';

/**
 * Turns a precomputed SHA-256 or SHA-512 compression listing into `instructions@<variant>` and
 * `registers@<variant>` (docs/M5.md §5, docs/M6.md §5). The listing runs once per block. The ISA profile says what
 * each instruction does to the **symbolic** register file (lane words, `shaWords.ts`); this walker
 * aligns the instructions (`shaSpans.ts`) and reads every register byte from the trace.
 */

/** What one instruction reads and writes, and the registers it leaves with new lane words. */
export interface ShaEffects {
  reads: OperandRef[];
  writes: OperandRef[];
  written: { reg: string; lanes: Lanes; valueRef?: string }[];
}

/** What an ISA profile's semantics see while the listing runs over one block. */
export interface ShaMachine {
  /** The symbolic register file before the instruction (read only: the walker applies `written`). */
  registers: Pick<ShaRegisterFile, 'read'>;
  /** The first round t of the next round instruction (K_t … for a W+K load); `undefined` after the last one. */
  nextRound: number | undefined;
  /** Value id of the chaining value the block reads: `iv` or `h/<n>`. */
  chainIn: string;
  /** Value id of the chaining value the block stores: `h/<n+1>`. */
  chainOut: string;
  /** The listing and the instruction's index in it, for semantics that follow a register's dataflow. */
  listing: readonly ShaListingInstruction[];
  index: number;
  /** Bytes per word of the trace: 4 (SHA-224/256) or 8 (SHA-384/512). */
  wordBytes: number;
  /** Rounds per block: 64 or 80 (where the feed-forward sums sit). */
  rounds: number;
}

/** What one mnemonic does to the symbolic registers; throws when its sources hold something unexpected. */
export type ShaSemantics = (instruction: ShaListingInstruction, machine: ShaMachine) => ShaEffects;

/** A SHA ISA deriver: its names, its listing, and the semantics of its instructions on lane words. */
export interface ShaIsaProfile extends IsaVariant {
  /** Lane widths the vector registers offer, e.g. [8, 16, 32, 64]. */
  lanes: number[];
  registerBits: number;
  /** The SHA-2 word size the listing works on: 32 (SHA-224/256) or 64 (SHA-384/512). */
  wordBits: 32 | 64;
  /**
   * Where the facet labels live when the deriver has several variants: `<labelNamespace>.label` and
   * `<labelNamespace>.registers.label` (default `deriver.<deriverId>`).
   */
  labelNamespace?: string;
  listing: ShaListing;
  /** Rounds per round instruction: 2 (`sha256rnds2`, `sha512h`/`sha512h2`), 4 (`sha256h`/`sha256h2`). */
  roundsPerInstruction: number;
  /** Canonical vector register name of an operand (`q1`, `v1.4s` → `v1`), or `undefined`. */
  vectorRegister(operand: string): string | undefined;
  /** The semantics of each mnemonic the listing uses. */
  semantics: Readonly<Record<string, ShaSemantics>>;
  /** An optional note on the instruction at `index`, given where the listing's rounds sit. */
  note?(
    instructions: readonly ShaListingInstruction[],
    index: number,
    shape: ShaListingShape,
  ): I18nRef | undefined;
}

/** What both SHA-256 vector ISAs share: 128-bit little-endian registers with 8 … 64-bit lanes. */
export const SHA256_VECTOR_DEFAULTS: Pick<
  ShaIsaProfile,
  'byteOrder' | 'lanes' | 'registerBits' | 'wordBits'
> = {
  byteOrder: 'little',
  lanes: [8, 16, 32, 64],
  registerBits: 128,
  wordBits: 32,
};

/** SHA-2 words per vector register: 4 (SHA-256 on 128 bits) or 2 (SHA-512). */
export function wordsPerRegister(
  profile: Pick<ShaIsaProfile, 'registerBits' | 'wordBits'>,
): number {
  return profile.registerBits / profile.wordBits;
}

/** The schedule words W_w … W_{w+count−1} a message instruction (`msg1`/`msg2` with `w`) works on. */
function scheduleWords(
  instruction: ShaListingInstruction,
  count: number,
): { first: number; last: number } | undefined {
  const { role, w } = instruction;
  return (role === 'msg1' || role === 'msg2') && w !== undefined
    ? { first: w, last: w + count - 1 }
    : undefined;
}

/**
 * The chips of an instruction (`deriver.<id>.covers.*`): the rounds of a round instruction, the
 * schedule words W_first … W_last a message instruction works on.
 */
export function shaCovers(
  profile: Pick<ShaIsaProfile, 'deriverId' | 'roundsPerInstruction' | 'registerBits' | 'wordBits'>,
  instruction: ShaListingInstruction,
): I18nRef[] {
  const namespace = `deriver.${profile.deriverId}.covers`;
  if (isRoundInstruction(instruction)) {
    const first = requiredShaRound(instruction);
    const last = first + profile.roundsPerInstruction - 1;
    return [{ key: `${namespace}.rounds`, params: { first, last } }];
  }
  const words = scheduleWords(instruction, wordsPerRegister(profile));
  return words === undefined ? [] : [{ key: `${namespace}.${instruction.role}`, params: words }];
}

/**
 * The note `deriver.<id>.note.scheduleAhead` on a message instruction: the schedule runs ahead of the
 * rounds. `count`: schedule words per register (4 for SHA-256, 2 for SHA-512).
 */
export function scheduleAheadNote(
  deriverId: string,
  instruction: ShaListingInstruction,
  count: number = LANE_COUNT,
): I18nRef | undefined {
  const words = scheduleWords(instruction, count);
  return words === undefined
    ? undefined
    : { key: `deriver.${deriverId}.note.scheduleAhead`, params: words };
}

/** The effect of `instruction` under the profile's semantics; throws for a mnemonic it has none for. */
export function shaExecute(
  profile: Pick<ShaIsaProfile, 'semantics'>,
  instruction: ShaListingInstruction,
  machine: ShaMachine,
): ShaEffects {
  const semantics = profile.semantics[instruction.mnemonic];
  if (semantics === undefined) throw new Error('no semantics for this mnemonic');
  return semantics(instruction, machine);
}

/** Static per-listing data, shared by every block. */
interface ListingPlan {
  shape: ShaListingShape;
  covers: I18nRef[][];
  notes: (I18nRef | undefined)[];
}

function planListing(profile: ShaIsaProfile): ListingPlan {
  const { instructions } = profile.listing;
  const shape = listingShape(instructions);
  return {
    shape,
    covers: instructions.map((instruction) => shaCovers(profile, instruction)),
    notes: instructions.map((_, index) => profile.note?.(instructions, index, shape)),
  };
}

/** Runs the profile's semantics, naming the instruction in any error they throw. */
function execute(
  profile: ShaIsaProfile,
  listed: ShaListingInstruction,
  machine: ShaMachine,
): ShaEffects {
  try {
    return shaExecute(profile, listed, machine);
  } catch (error) {
    throw listingError(listed, error);
  }
}

/** The spans of block `blockIndex` after the span before it (§5c). */
function spansOfBlock(
  trace: ShaTrace,
  profile: ShaIsaProfile,
  shape: ShaListingShape,
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
  return blockSpans(profile.listing.instructions, shape, timeline, previous);
}

/** The register writes of `effects` with bytes: an untraced (`partial`) register is left out (docs/M6.md §5c). */
function tracedWrites(context: ShaBlockContext, effects: ShaEffects) {
  return effects.written
    .filter(({ lanes }) => isTraced(lanes))
    .map(({ reg, lanes, valueRef }) => registerWrite(reg, registerBytes(context, lanes), valueRef));
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
  const spans = spansOfBlock(trace, profile, plan.shape, blockIndex, walk.previous);
  const registers = new ShaRegisterFile();
  const chainIn = chainingValueId(trace, blockIndex);
  const chainOut = chainingValueId(trace, blockIndex + 1);
  const listing = profile.listing.instructions;
  listing.forEach((listed, index) => {
    const align = spans[index]!;
    const nextRound = plan.shape.nextRound[index];
    const { wordBytes, rounds } = trace;
    const machine = { registers, nextRound, chainIn, chainOut, listing, index, wordBytes, rounds };
    const effects = execute(profile, listed, machine);
    effects.written.forEach(({ reg, lanes }) => registers.write(reg, lanes));
    walk.instructions.push(
      buildInstruction(listed, align, effects, plan.covers[index]!, plan.notes[index]),
    );
    if (effects.written.length > 0)
      walk.steps.push({ align, writes: tracedWrites(context, effects) });
  });
  walk.previous = spans.at(-1) ?? walk.previous;
}

/** The facet labels under `profile.labelNamespace`, when it has one (a deriver with several variants). */
function relabelled(
  facets: Partial<Record<FacetKey, unknown>>,
  profile: Pick<ShaIsaProfile, 'labelNamespace' | 'variant'>,
): Partial<Record<FacetKey, unknown>> {
  const namespace = profile.labelNamespace;
  if (namespace === undefined) return facets;
  const label = (kind: string, key: string) => {
    const facet = facets[facetKey(kind, profile.variant)] as object;
    return { [facetKey(kind, profile.variant)]: { ...facet, label: { key } } };
  };
  return {
    ...label('instructions', `${namespace}.label`),
    ...label('registers', `${namespace}.registers.label`),
  };
}

/** Throws unless the trace's words are the profile's (a SHA-512 listing on a SHA-256 trace, say). */
function checkWordSize(trace: ShaTrace, profile: ShaIsaProfile): void {
  if (trace.wordBytes * 8 !== profile.wordBits)
    throw new Error(
      `the ${profile.variant} listing works on ${profile.wordBits}-bit words, the trace on ${trace.wordBytes * 8}-bit`,
    );
}

/** Derives `instructions@<variant>` and `registers@<variant>` for a SHA-2 round-detail bundle of the profile's word size. */
export function deriveShaIsaFacets(
  bundle: TraceBundle,
  profile: ShaIsaProfile,
): Partial<Record<FacetKey, unknown>> {
  const trace = shaTrace(bundle);
  checkWordSize(trace, profile);
  const plan = planListing(profile);
  const walk = { instructions: [], steps: [], previous: INITIAL_SPAN };
  trace.blocks.forEach((_, blockIndex) => walkBlock(trace, profile, plan, blockIndex, walk));
  const names = profile.listing.instructions.flatMap((instruction) =>
    instruction.operands.flatMap((operand) => profile.vectorRegister(operand) ?? []),
  );
  const facets = isaFacetPair(
    profile,
    profile.listing,
    { instructions: walk.instructions, steps: walk.steps },
    vectorRegisterSpecs(names, profile.registerBits, profile.lanes),
  );
  return relabelled(facets, profile);
}
