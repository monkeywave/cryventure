import { highlight, i18nRef, scopeLevels, zeroSnapshot, type RegionSpec, type StateFacet, type WordopsFacet } from '@cryventure/core';
import { WordopsRecorder } from '../_lib/sha2/wordopsRecorder.ts';
import { mismatchedIndices } from './compare.ts';
import type { KeccakConstantsOpName } from './manifest.ts';
import { cellIndex, distinctCount, offsetsTable, RHO_STEPS, rhoWalk, type RhoStep } from './rhoWalk.ts';

/**
 * Records the ρ offsets (docs/M6.md §2c): one step per t of the (x, y) walk, then a comparison
 * with FIPS 202 Table 2. Region `offsets` is a 5 × 5 `u8` grid, row-major (cell x + 5y), blank
 * until written; the comparison writes lane (0, 0)'s offset 0, which the walk never visits.
 */
export type RhoRegion = 'offsets';
export type RhoOp = { op: KeccakConstantsOpName };
export type RhoStateFacet = StateFacet<RhoRegion, RhoOp>;
type RhoRecorder = WordopsRecorder<RhoRegion, RhoOp>;

const NS = 'plugin.keccak-constants';
const LANE_BITS = 64;
const ORIGIN = 0;

export function rhoRegions(): RegionSpec<RhoRegion>[] {
  return [{ id: 'offsets', labelKey: `${NS}.region.offsets`, elem: 'u8', shape: [5, 5], order: 'row-major', layout: { kind: 'grid' }, initial: 'blank' }];
}

/** Narration params of one walk step; the last one says the walk is back at its start. */
function offsetNarration(step: RhoStep): ReturnType<typeof i18nRef> {
  const { t, position, next } = step;
  const key = t === RHO_STEPS - 1 ? 'offsetLast' : 'offset';
  return i18nRef(`${NS}.step.${key}`, { t, x: position.x, y: position.y, t1: t + 1, t2: t + 2, triangular: step.triangular, offset: step.offset, nextX: next.x, nextY: next.y });
}

function recordOffset(recorder: RhoRecorder, step: RhoStep): void {
  const cell = cellIndex(step.position);
  recorder.op({
    op: 'offset',
    writes: [{ region: 'offsets', offset: cell, values: [step.offset] }],
    highlights: [highlight('offsets', 'write', [cell])],
    narration: offsetNarration(step),
  });
}

function recordCompare(recorder: RhoRecorder, steps: readonly RhoStep[], mismatches: number[]): void {
  const matches = mismatches.length === 0;
  const params = {
    positions: distinctCount(steps.map((step) => cellIndex(step.position))),
    offsets: distinctCount(steps.map((step) => step.offset)),
    ...(matches ? {} : { mismatches: mismatches.length }),
  };
  recorder.op({
    op: 'compare',
    writes: [{ region: 'offsets', offset: ORIGIN, values: [0] }],
    highlights: [highlight('offsets', 'write', [ORIGIN])],
    narration: i18nRef(`${NS}.step.${matches ? 'rhoMatch' : 'rhoMismatch'}`, params),
  });
}

export interface RhoRecording {
  state: RhoStateFacet;
  /** Empty: the walk has no word equations, but the manifest declares the facet for every run. */
  wordops: WordopsFacet;
  steps: RhoStep[];
  /** The 25 offsets by lane index x + 5y. */
  table: number[];
  /** Lanes whose offset differs from the reference (empty = Table 2 is reproduced). */
  mismatches: number[];
}

/** Walks t = 0 … 23 (one step each), then compares the 25 offsets with `reference`. */
export function recordRhoOffsets(reference: readonly number[]): RhoRecording {
  const regions = rhoRegions();
  const recorder: RhoRecorder = new WordopsRecorder(regions, zeroSnapshot(regions), scopeLevels(NS, 'step'), i18nRef(`${NS}.step.initial.rho`, { steps: RHO_STEPS }));
  const steps = rhoWalk();
  steps.forEach((step) => recordOffset(recorder, step));
  const table = offsetsTable(steps);
  const mismatches = mismatchedIndices(table, reference);
  recordCompare(recorder, steps, mismatches);
  return { state: recorder.stateFacet(), wordops: recorder.wordopsFacet(LANE_BITS), steps, table, mismatches };
}
