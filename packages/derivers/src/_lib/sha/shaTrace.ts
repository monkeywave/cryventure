import {
  getFacet,
  stateAt,
  toHex,
  type AnyStateFacet,
  type TraceBundle,
  type ValuesFacet,
  type WordopsFacet,
  type WordTerm,
} from '@cryventure/core';

/**
 * Reads the SHA-256 producer's **published facet contract** (docs/M5.md §2c–2d, §5c), never its code:
 * state regions `vars` (a … h), `w` (W_0 … W_63) and `h` (H), all 4-byte big-endian words; ops `init`,
 * `schedule`, `round`, `feedForward` (per block) and `output`; the `wordops` terms `k`, `kw` (round t)
 * and `p1`, `p2` (schedule t); the values `iv` and `h/<n>`. A broken contract throws, and so do
 * facets that disagree: the derivers take K+W, p1, p2 from `wordops` but a … h, W and H from `state`,
 * so each round's `w` term must be word t of `w` and its `registers.after` the `vars` region.
 */

export const SHA_WORD_BYTES = 4;
/** SHA-224/256 rounds per block (FIPS 180-4 §6.2.2). */
export const SHA256_ROUNDS = 64;
/** The first schedule word computed by `schedule` (W_0 … W_15 come from the block). */
export const SHA256_FIRST_SCHEDULED = 16;
/** The working variables in register order. */
export const SHA_VAR_NAMES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'] as const;
export type ShaVarName = (typeof SHA_VAR_NAMES)[number];

const REQUIRED_REGIONS = ['vars', 'w', 'h'] as const;

/** Where one block's ops sit on the state timeline. */
export interface ShaBlockSteps {
  /** 0-based block index n − 1. */
  index: number;
  /** The `init` step: a … h ← H, W_0 … W_15 ← the block. */
  init: number;
  /** `round t` step per t (0 … 63). */
  rounds: readonly number[];
  /** `schedule t` step per t (index t; `undefined` for t < 16). */
  schedule: readonly (number | undefined)[];
  /** The `feedForward` step: H ← H + (a, …, h). */
  feedForward: number;
}

export interface ShaTrace {
  facet: AnyStateFacet;
  values: ValuesFacet;
  wordops: WordopsFacet;
  blocks: readonly ShaBlockSteps[];
  /** The `output` step (digest written). */
  output: number;
  stepCount: number;
}

function contractError(message: string): Error {
  return new Error(`SHA-256 trace contract: ${message}`);
}

function stateFacetOf(bundle: TraceBundle): AnyStateFacet {
  const facet = getFacet<AnyStateFacet>(bundle, 'state');
  if (facet === undefined) throw contractError('no state facet');
  for (const region of REQUIRED_REGIONS)
    if (!facet.regions.some((spec) => spec.id === region))
      throw contractError(`no "${region}" region`);
  return facet;
}

function facetOf<T>(bundle: TraceBundle, kind: 'values' | 'wordops'): T {
  const facet = getFacet<T>(bundle, kind);
  if (facet === undefined) throw contractError(`no ${kind} facet`);
  return facet;
}

/** A block under construction while the steps are scanned in order. */
interface OpenBlock {
  init: number;
  rounds: number[];
  schedule: (number | undefined)[];
  scheduled: number;
}

function closeBlock(block: OpenBlock, index: number, feedForward: number): ShaBlockSteps {
  if (block.rounds.length !== SHA256_ROUNDS)
    throw contractError(
      `block ${index} has ${block.rounds.length} round steps, not ${SHA256_ROUNDS}`,
    );
  if (block.scheduled !== SHA256_ROUNDS - SHA256_FIRST_SCHEDULED)
    throw contractError(`block ${index} has ${block.scheduled} schedule steps`);
  return { index, init: block.init, rounds: block.rounds, schedule: block.schedule, feedForward };
}

/** Collects the blocks: `init`, then `schedule t` (t ≥ 16) / `round t` in order, then `feedForward`. */
function locateBlocks(facet: AnyStateFacet): { blocks: ShaBlockSteps[]; output: number } {
  const blocks: ShaBlockSteps[] = [];
  let open: OpenBlock | undefined;
  let output: number | undefined;
  facet.steps.forEach(({ op }, step) => {
    if (op === 'init') open = { init: step, rounds: [], schedule: [], scheduled: 0 };
    else if (op === 'output') output = step;
    else if (open === undefined) return;
    else if (op === 'round') open.rounds.push(step);
    else if (op === 'schedule') open.schedule[SHA256_FIRST_SCHEDULED + open.scheduled++] = step;
    else if (op === 'feedForward') {
      blocks.push(closeBlock(open, blocks.length, step));
      open = undefined;
    }
  });
  if (blocks.length === 0) throw contractError('no init … feedForward block at round detail');
  if (output === undefined) throw contractError('no output step');
  return { blocks, output };
}

/** Throws unless round `t` of `block` records the same W_t and a … h in `wordops` as in `state`. */
function checkRoundAgrees(trace: ShaTrace, block: ShaBlockSteps, t: number): void {
  const step = roundStep(block, t);
  const where = `block ${block.index} round ${t}`;
  const termW = toHex(termWord(trace, step, 'w'));
  const stateW = toHex(regionWord(trace, 'w', step, t));
  if (termW !== stateW)
    throw contractError(`${where}: wordops w ${termW} ≠ state W_${t} ${stateW}`);
  const after = trace.wordops.steps.find((entry) => entry.step === step)?.registers?.after;
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
    for (let t = 0; t < SHA256_ROUNDS; t++) checkRoundAgrees(trace, block, t);
}

const traces = new WeakMap<TraceBundle, ShaTrace>();

/** The bundle's SHA trace, read once per bundle (bundles are immutable once recorded); throws on a broken contract. */
export function shaTrace(bundle: TraceBundle): ShaTrace {
  let trace = traces.get(bundle);
  if (trace === undefined) {
    const facet = stateFacetOf(bundle);
    trace = {
      facet,
      values: facetOf<ValuesFacet>(bundle, 'values'),
      wordops: facetOf<WordopsFacet>(bundle, 'wordops'),
      ...locateBlocks(facet),
      stepCount: facet.steps.length,
    };
    checkFacetsAgree(trace);
    traces.set(bundle, trace);
  }
  return trace;
}

/** The big-endian bytes of word `index` of `region` after `step`. */
export function regionWord(trace: ShaTrace, region: string, step: number, index: number): number[] {
  const offset = index * SHA_WORD_BYTES;
  const bytes = stateAt(trace.facet, step)[region]?.slice(offset, offset + SHA_WORD_BYTES);
  if (bytes?.length !== SHA_WORD_BYTES)
    throw contractError(`region "${region}" has no word ${index} after step ${step}`);
  return [...bytes];
}

/** The `wordops` term `id` of state step `step`, as big-endian bytes. */
export function termWord(trace: ShaTrace, step: number, id: string): number[] {
  const term: WordTerm | undefined = trace.wordops.steps
    .find((entry) => entry.step === step)
    ?.terms.find((candidate) => candidate.id === id);
  if (term === undefined) throw contractError(`no wordops term "${id}" at step ${step}`);
  return term.hex.match(/../g)!.map((pair) => parseInt(pair, 16));
}

/** The value id of the chaining value H^(n): `iv` for n = 0, else `h/<n>`; throws when the values facet lacks it. */
export function chainingValueId(trace: ShaTrace, n: number): string {
  const id = n === 0 ? 'iv' : `h/${n}`;
  if (!trace.values.values.some((value) => value.id === id))
    throw contractError(`no value "${id}"`);
  return id;
}

/** The round-t step of `block`; throws for t outside 0 … 63. */
export function roundStep(block: ShaBlockSteps, t: number): number {
  const step = block.rounds[t];
  if (step === undefined) throw contractError(`no round ${t} in block ${block.index}`);
  return step;
}

/** The schedule-t step of `block`; throws for t outside 16 … 63. */
export function scheduleStep(block: ShaBlockSteps, t: number): number {
  const step = block.schedule[t];
  if (step === undefined) throw contractError(`no schedule ${t} in block ${block.index}`);
  return step;
}
