import { allIndices, highlight, i18nRef, scopeLevels, valueId, zeroSnapshot, type RegionSpec, type Snapshot, type StateFacet, type WordopsFacet, type WordTerm } from '@cryventure/core';
import { laneBytes, laneHex } from '../_lib/keccak/lanes.ts';
import { u8Region, wordIndices } from '../_lib/sha2/regions.ts';
import { WordopsRecorder } from '../_lib/sha2/wordopsRecorder.ts';
import { mismatchedIndices } from './compare.ts';
import { bitWord, deriveRoundConstant, fipsRegisterBits, LFSR_START, type DerivedRoundConstant } from './lfsr.ts';
import type { KeccakConstantsOpName } from './manifest.ts';

/**
 * Records the ι round constants (docs/M6.md §2c): one step per round (seven LFSR bits → RC[i]),
 * then a comparison with the published table. The `rc` region shows each RC[i] as a 64-bit integer,
 * most significant byte first (`byteOrder: 'big'`), as the table prints it; ι XORs it into lane
 * (0, 0), whose bytes the state stores little-endian, and the narration says so.
 */
export type RcRegion = 'lfsr' | 'rc';
export type RcOp = { op: KeccakConstantsOpName };
export type RcStateFacet = StateFacet<RcRegion, RcOp>;
type RcRecorder = WordopsRecorder<RcRegion, RcOp>;

const NS = 'plugin.keccak-constants';
const RC_BYTES = 8;
const RC_BITS = 64;
const WORDS_PER_ROW = 4;

/** RC[i] as stored in the `rc` region: big-endian (the integer as printed). */
export const roundConstantBytes = (value: bigint): number[] => laneBytes(value).reverse();

/** `lfsr`: the register byte (starts at R = 10000000, i.e. 01); `rc`: 24 big-endian words, blank until derived. */
export function rcRegions(rounds: number): RegionSpec<RcRegion>[] {
  return [
    u8Region(NS, 'lfsr', 1, undefined, false),
    u8Region(NS, 'rc', rounds * RC_BYTES, { kind: 'words', wordBytes: RC_BYTES, labelPrefix: 'RC', wordsPerGroup: WORDS_PER_ROW, byteOrder: 'big' }),
  ];
}

function rcInitialSnapshot(regions: readonly RegionSpec<RcRegion>[]): Snapshot<RcRegion> {
  return { ...zeroSnapshot(regions), lfsr: [LFSR_START] };
}

/** Value id of RC[round] (the wordops result term links to it). */
export function roundValueId(round: number): string {
  return valueId([round], 'rc');
}

/** The seven placed LFSR bits, then RC[i] (their OR) as the story result. */
export function roundTerms(derived: DerivedRoundConstant): WordTerm[] {
  const bitTerms = derived.bits.map(
    (bit): WordTerm => ({ id: `rc${bit.t}`, label: i18nRef(`${NS}.term.rcBit`, { t: bit.t, bit: bit.bit, position: bit.position }), hex: laneHex(bitWord(bit)), role: 'operand' }),
  );
  const result: WordTerm = { id: 'RC', label: i18nRef(`${NS}.term.rc`, { round: derived.round }), hex: laneHex(derived.value), role: 'result', op: 'or', emphasis: 'story', valueRef: roundValueId(derived.round) };
  return [...bitTerms, result];
}

function roundNarrationParams(derived: DerivedRoundConstant): Record<string, string | number> {
  const { bits } = derived;
  return {
    round: derived.round,
    tFirst: bits[0]!.t,
    tLast: bits.at(-1)!.t,
    bits: bits.map((bit) => bit.bit).join(' '),
    word: laneHex(derived.value),
    register: fipsRegisterBits(derived.registerAfter),
  };
}

function recordRound(recorder: RcRecorder, derived: DerivedRoundConstant): void {
  recorder.op(
    {
      op: 'round',
      writes: [
        { region: 'lfsr', offset: 0, values: [derived.registerAfter] },
        { region: 'rc', offset: derived.round * RC_BYTES, values: roundConstantBytes(derived.value) },
      ],
      highlights: [highlight('lfsr', 'write', [0]), highlight('rc', 'write', wordIndices(RC_BYTES, derived.round))],
      narration: i18nRef(`${NS}.step.round`, roundNarrationParams(derived)),
    },
    { formula: i18nRef(`${NS}.math.round`, { round: derived.round, tBase: 7 * derived.round }), terms: roundTerms(derived) },
  );
}

function recordCompare(recorder: RcRecorder, rounds: number, mismatches: number[]): void {
  const matches = mismatches.length === 0;
  recorder.op({
    op: 'compare',
    writes: [],
    highlights: [highlight('rc', 'read', wordIndices(RC_BYTES, 0, rounds))],
    narration: i18nRef(`${NS}.step.${matches ? 'rcMatch' : 'rcMismatch'}`, { rounds, ...(matches ? {} : { mismatches: mismatches.length }) }),
  });
}

export interface RcRecording {
  state: RcStateFacet;
  wordops: WordopsFacet;
  derived: DerivedRoundConstant[];
  /** Rounds whose RC differs from the reference (empty = the table is reproduced). */
  mismatches: number[];
}

/** Derives RC[0 … n−1] for the `reference` table's n rounds (one step each), then compares. */
export function recordRoundConstants(reference: readonly bigint[]): RcRecording {
  const regions = rcRegions(reference.length);
  const recorder: RcRecorder = new WordopsRecorder(regions, rcInitialSnapshot(regions), scopeLevels(NS, 'round'), i18nRef(`${NS}.step.initial.rc`, { rounds: reference.length }));
  const derived = allIndices(reference.length).map(deriveRoundConstant);
  derived.forEach((round) => recordRound(recorder, round));
  const mismatches = mismatchedIndices(derived.map((round) => round.value), reference);
  recordCompare(recorder, reference.length, mismatches);
  return { state: recorder.stateFacet(), wordops: recorder.wordopsFacet(RC_BITS), derived, mismatches };
}
