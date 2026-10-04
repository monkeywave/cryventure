import {
  parseHexToArray,
  stateAt,
  toHex,
  valueId,
  type AnyStateFacet,
  type Snapshot,
  type TraceBundle,
  type ValuesFacet,
  type WordopsFacet,
  type WordopsStep,
} from '@cryventure/core';
import {
  memoizePerBundle,
  regionSlice,
  requiredFacet,
  requiredStateFacet,
  traceContractError,
} from '../traceFacets.ts';

/**
 * Reads the SHA-256 and SHA-512 producers' **published facet contract** (docs/M5.md §2c–2d, §5c,
 * docs/M6.md §2f, §5c), never their code: state regions `vars` (a … h), `w` (W_0 … W_63, or W_79) and
 * `h` (H), all big-endian words of 4 bytes (`wordops.wordBits` 32: 64 rounds) or 8 bytes (64: 80
 * rounds); ops `init`, `schedule`, `round`, `feedForward` (per block) and `output`; the `wordops` terms
 * `k`, `kw`, `hKW`, `T1` (round t) and `p1`, `p2` (schedule t); the values `iv` and `h/<n>`. A broken contract throws, and so do
 * facets that disagree: the derivers take K+W, p1, p2 from `wordops` but a … h, W and H from `state`,
 * so each round's `w` term must be word t of `w` and its `registers.after` the `vars` region.
 */

/** Bytes per SHA-224/256 word. */
export const SHA_WORD_BYTES = 4;
/** SHA-224/256 rounds per block (FIPS 180-4 §6.2.2). */
export const SHA256_ROUNDS = 64;
/** SHA-384/512 rounds per block (FIPS 180-4 §6.4.2). */
export const SHA512_ROUNDS = 80;

/** Word size and rounds per block of each SHA-2 word width (`wordops.wordBits`). */
const SHA2_SHAPES: Readonly<Record<number, { wordBytes: number; rounds: number }>> = {
  32: { wordBytes: SHA_WORD_BYTES, rounds: SHA256_ROUNDS },
  64: { wordBytes: 8, rounds: SHA512_ROUNDS },
};
/** The first schedule word computed by `schedule` (W_0 … W_15 come from the block). */
export const SHA256_FIRST_SCHEDULED = 16;
/** The working variables in register order. */
export const SHA_VAR_NAMES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'] as const;
export type ShaVarName = (typeof SHA_VAR_NAMES)[number];

const REQUIRED_REGIONS = ['vars', 'w', 'h'] as const;
type ShaRegion = (typeof REQUIRED_REGIONS)[number];

/** Where one block's ops sit on the state timeline. */
export interface ShaBlockSteps {
  /** 0-based block index n − 1. */
  index: number;
  /** The `init` step: a … h ← H, W_0 … W_15 ← the block. */
  init: number;
  /** `round t` step per t (0 … 63, or 79). */
  rounds: readonly number[];
  /** `schedule t` step per t (index t; `undefined` for t < 16). */
  schedule: readonly (number | undefined)[];
  /** The `feedForward` step: H ← H + (a, …, h). */
  feedForward: number;
}

export interface ShaTrace {
  /** Bytes per word: 4 (SHA-224/256) or 8 (SHA-384/512). */
  wordBytes: number;
  /** Rounds per block: 64 or 80. */
  rounds: number;
  facet: AnyStateFacet;
  values: ValuesFacet;
  wordops: WordopsFacet;
  blocks: readonly ShaBlockSteps[];
  /** The `output` step (digest written). */
  output: number;
  /**
   * The `vars`, `w` and `h` words after each step the derivers read (`init`, `schedule`, `round`,
   * `feedForward`), from one replay in order (lookups by step never replay again).
   */
  states: ReadonlyMap<number, Snapshot<ShaRegion>>;
  /** The `wordops` entry of each state step that has one. */
  wordopsByStep: ReadonlyMap<number, WordopsStep>;
}

const CONTRACT = 'SHA-2';

function contractError(message: string): Error {
  return traceContractError(CONTRACT, message);
}

/** A block under construction while the steps are scanned in order. */
interface OpenBlock {
  init: number;
  rounds: number[];
  schedule: (number | undefined)[];
}

/** Schedule steps seen so far: W_16 on are scheduled, W_0 … W_15 come from the block. */
const scheduledCount = (block: OpenBlock): number =>
  Math.max(block.schedule.length - SHA256_FIRST_SCHEDULED, 0);

function closeBlock(
  block: OpenBlock,
  index: number,
  feedForward: number,
  rounds: number,
): ShaBlockSteps {
  if (block.rounds.length !== rounds)
    throw contractError(`block ${index} has ${block.rounds.length} round steps, not ${rounds}`);
  const scheduled = scheduledCount(block);
  if (scheduled !== rounds - SHA256_FIRST_SCHEDULED)
    throw contractError(`block ${index} has ${scheduled} schedule steps`);
  return { index, init: block.init, rounds: block.rounds, schedule: block.schedule, feedForward };
}

/** Collects the blocks: `init`, then `schedule t` (t ≥ 16) / `round t` in order, then `feedForward`. */
function locateBlocks(
  facet: AnyStateFacet,
  rounds: number,
): { blocks: ShaBlockSteps[]; output: number } {
  const blocks: ShaBlockSteps[] = [];
  let open: OpenBlock | undefined;
  let output: number | undefined;
  const noFeedForward = (): Error => contractError(`block ${blocks.length} has no feedForward`);
  facet.steps.forEach(({ op }, step) => {
    if (op === 'init') {
      if (open !== undefined) throw noFeedForward();
      open = { init: step, rounds: [], schedule: [] };
      return;
    }
    if (op === 'output') {
      output = step;
      return;
    }
    if (open === undefined) return;
    switch (op) {
      case 'round':
        open.rounds.push(step);
        break;
      case 'schedule':
        open.schedule[SHA256_FIRST_SCHEDULED + scheduledCount(open)] = step;
        break;
      case 'feedForward':
        blocks.push(closeBlock(open, blocks.length, step, rounds));
        open = undefined;
        break;
    }
  });
  if (open !== undefined) throw noFeedForward();
  if (blocks.length === 0) throw contractError('no init … feedForward block at round detail');
  if (output === undefined) throw contractError('no output step');
  return { blocks, output };
}

/** The steps whose state the derivers read: every block's init, schedule, round and feed-forward steps. */
function readSteps(blocks: readonly ShaBlockSteps[]): Set<number> {
  return new Set(
    blocks.flatMap((block) => [
      block.init,
      ...block.schedule.filter((step) => step !== undefined),
      ...block.rounds,
      block.feedForward,
    ]),
  );
}

/**
 * The `vars`, `w` and `h` regions after each read step. One replay in order up to the last read step,
 * so `stateAt` applies each step's writes once; the other steps' states are not kept.
 */
function replayReadStates(
  facet: AnyStateFacet,
  blocks: readonly ShaBlockSteps[],
): Map<number, Snapshot<ShaRegion>> {
  const read = readSteps(blocks);
  const states = new Map<number, Snapshot<ShaRegion>>();
  const last = Math.max(...read);
  for (let step = 0; step <= last; step++) {
    const state = stateAt(facet, step);
    if (read.has(step)) states.set(step, { vars: state.vars!, w: state.w!, h: state.h! });
  }
  return states;
}

/** Throws unless round `t` of `block` records the same W_t and a … h in `wordops` as in `state`. */
function checkRoundAgrees(trace: ShaTrace, block: ShaBlockSteps, t: number): void {
  const step = roundStep(block, t);
  const where = `block ${block.index} round ${t}`;
  const termW = toHex(termWord(trace, step, 'w'));
  const stateW = toHex(regionWord(trace, 'w', step, t));
  if (termW !== stateW)
    throw contractError(`${where}: wordops w ${termW} ≠ state W_${t} ${stateW}`);
  const after = trace.wordopsByStep.get(step)?.registers?.after;
  if (after === undefined) throw contractError(`${where}: no wordops registers`);
  SHA_VAR_NAMES.forEach((name, index) => {
    const stateVar = toHex(regionWord(trace, 'vars', step, index));
    if (after[index] !== stateVar)
      throw contractError(`${where}: wordops ${name} ${after[index]} ≠ state ${name} ${stateVar}`);
  });
}

/** Throws unless the wordops register names are a … h, in order (the order of `registers.after`). */
function checkRegisterNames(wordops: WordopsFacet): void {
  const names = wordops.registerNames?.join(',');
  if (names !== SHA_VAR_NAMES.join(','))
    throw contractError(`wordops register names ${names ?? '(none)'}, not a … h`);
}

/** Throws where `wordops` and `state` disagree on a round (comparing recorded bytes, not computing). */
function checkFacetsAgree(trace: ShaTrace): void {
  checkRegisterNames(trace.wordops);
  for (const block of trace.blocks)
    for (let t = 0; t < trace.rounds; t++) checkRoundAgrees(trace, block, t);
}

/** Word size and rounds of the trace, from `wordops.wordBits`; throws for a width SHA-2 does not use. */
function sha2Shape(wordops: WordopsFacet): { wordBytes: number; rounds: number } {
  const shape = SHA2_SHAPES[wordops.wordBits];
  if (shape === undefined)
    throw contractError(`wordops word size ${wordops.wordBits}, not 32 or 64`);
  return shape;
}

function readShaTrace(bundle: TraceBundle): ShaTrace {
  const facet = requiredStateFacet(bundle, REQUIRED_REGIONS, CONTRACT);
  const wordops = requiredFacet<WordopsFacet>(bundle, 'wordops', CONTRACT);
  const shape = sha2Shape(wordops);
  const { blocks, output } = locateBlocks(facet, shape.rounds);
  const trace: ShaTrace = {
    ...shape,
    facet,
    values: requiredFacet<ValuesFacet>(bundle, 'values', CONTRACT),
    wordops,
    blocks,
    output,
    states: replayReadStates(facet, blocks),
    wordopsByStep: new Map(wordops.steps.map((entry) => [entry.step, entry])),
  };
  checkFacetsAgree(trace);
  return trace;
}

/** The bundle's SHA trace, read once per bundle (bundles are immutable once recorded); throws on a broken contract. */
export const shaTrace: (bundle: TraceBundle) => ShaTrace = memoizePerBundle(readShaTrace);

/** The big-endian bytes of word `index` of `region` after `step`. */
export function regionWord(trace: ShaTrace, region: string, step: number, index: number): number[] {
  const state = trace.states.get(step);
  const bytes =
    state === undefined
      ? undefined
      : regionSlice(state, region, index * trace.wordBytes, trace.wordBytes);
  if (bytes === undefined)
    throw contractError(`region "${region}" has no word ${index} after step ${step}`);
  return bytes;
}

/** The `wordops` term `id` of state step `step`, as big-endian bytes. */
export function termWord(trace: ShaTrace, step: number, id: string): number[] {
  const term = trace.wordopsByStep.get(step)?.terms.find((candidate) => candidate.id === id);
  if (term === undefined) throw contractError(`no wordops term "${id}" at step ${step}`);
  return parseHexToArray(term.hex);
}

/** The value id of the chaining value H^(n): `iv` for n = 0, else `h/<n>`; throws when the values facet lacks it. */
export function chainingValueId(trace: ShaTrace, n: number): string {
  const id = n === 0 ? 'iv' : valueId(['h'], String(n));
  if (!trace.values.values.some((value) => value.id === id))
    throw contractError(`no value "${id}"`);
  return id;
}

/** The round-t step of `block`; throws for t outside 0 … 63 (or 79). */
export function roundStep(block: ShaBlockSteps, t: number): number {
  const step = block.rounds[t];
  if (step === undefined) throw contractError(`no round ${t} in block ${block.index}`);
  return step;
}

/** The schedule-t step of `block`; throws for t outside 16 … 63 (or 79). */
export function scheduleStep(block: ShaBlockSteps, t: number): number {
  const step = block.schedule[t];
  if (step === undefined) throw contractError(`no schedule ${t} in block ${block.index}`);
  return step;
}
