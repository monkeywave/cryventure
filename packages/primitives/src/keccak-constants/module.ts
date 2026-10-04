import { INITIAL_STEP_INDEX, narrationFromState, runPrimitive, valueRef, type RunOptions, type RunResult, type ValuesFacet } from '@cryventure/core';
import { RHO_OFFSETS, ROUND_CONSTANTS } from '../_lib/keccak/constants.ts';
import { keccakConstantsManifest, type KeccakConstantsParams } from './manifest.ts';
import { recordRoundConstants, roundConstantBytes, type RcRecording } from './rcTrace.ts';
import { recordRhoOffsets, type RhoRecording } from './rhoTrace.ts';

/** keccak-constants producer: derives the ι round constants (LFSR) or the ρ offsets (walk) and checks them against the published tables. */
const NS = 'plugin.keccak-constants';

/** The 24 round constants as bytes: big-endian words, concatenated. */
const rcTableBytes = (words: readonly bigint[]): number[] => words.flatMap(roundConstantBytes);

/** The reference table from the start; each RC[i] once derived (scope [i], the wordops link); the whole table after the last round. */
export function buildRcValues(recording: RcRecording, reference: readonly bigint[]): ValuesFacet {
  const { derived } = recording;
  const perRound = derived.map(({ round, value }) => valueRef(NS, 'rc', 'constant', roundConstantBytes(value), round, [round]));
  const values = [
    valueRef(NS, 'referenceRc', 'constant', rcTableBytes(reference), INITIAL_STEP_INDEX),
    ...perRound,
    valueRef(NS, 'roundConstants', 'constant', rcTableBytes(derived.map(({ value }) => value)), derived.length - 1),
  ];
  return { kind: 'values', schemaVersion: 1, values };
}

/** FIPS 202 Table 2 from the start; each offset once walked (scope [t]); the whole table at the comparison, which completes lane (0, 0). */
export function buildRhoValues(recording: RhoRecording, reference: readonly number[]): ValuesFacet {
  const { steps, table } = recording;
  const perStep = steps.map(({ t, offset }) => valueRef(NS, 'offset', 'constant', [offset], t, [t]));
  const values = [valueRef(NS, 'referenceRho', 'constant', [...reference], INITIAL_STEP_INDEX), ...perStep, valueRef(NS, 'offsets', 'constant', table, steps.length)];
  return { kind: 'values', schemaVersion: 1, values };
}

function runRc() {
  const recording = recordRoundConstants(ROUND_CONSTANTS);
  return {
    facets: { state: recording.state, values: buildRcValues(recording, ROUND_CONSTANTS), narration: narrationFromState(recording.state), wordops: recording.wordops },
    output: { table: rcTableBytes(recording.derived.map(({ value }) => value)) },
  };
}

function runRho() {
  const recording = recordRhoOffsets(RHO_OFFSETS);
  return {
    facets: { state: recording.state, values: buildRhoValues(recording, RHO_OFFSETS), narration: narrationFromState(recording.state), wordops: recording.wordops },
    output: { table: recording.table },
  };
}

/** Validates `params`, derives the chosen table step by step and returns a TraceBundle. */
export function run(params: KeccakConstantsParams, _options: RunOptions = {}): RunResult {
  return runPrimitive(keccakConstantsManifest, params, ({ constant }) => (constant === 'rc' ? runRc() : runRho()));
}
