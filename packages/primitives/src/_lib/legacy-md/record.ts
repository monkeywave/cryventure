import {
  allIndices,
  assertMatchesReference,
  blocksOf,
  INITIAL_STEP_INDEX,
  narrationFromState,
  scopeLevels,
  valueRef,
  type PrimitiveRecording,
  type ValueRef,
  type ValuesFacet,
  type WordopsFacet,
} from '@cryventure/core';
import type { Sha2Padding } from '../sha2/padding.ts';
import { initialSnapshot } from '../sha2/regions.ts';
import { chainingValueId, recordPad } from '../sha2/steps.ts';
import { WordopsRecorder } from '../sha2/wordopsRecorder.ts';
import type { LegacyAlgorithm, LegacyBlock } from './algorithm.ts';
import type { LegacyDetail, LegacyOpName } from './manifestKit.ts';
import { LEGACY_BLOCK_BYTES, legacyRegions, type LegacyRegion } from './regions.ts';
import { legacyInitialNarration, legacyTrace, recordCompress, recordFeedForward, recordInit, recordOutput, recordRound, recordSchedule, type LegacyTrace } from './steps.ts';
import { WORD32, wordsToBytes } from '../sha2/words.ts';

/**
 * Records one MD5 or SHA-1 run into the `state`, `values`, `narration` and `wordops` (schema v2)
 * facets and the `{ digest }` output (docs/M6.md §2e), checked against the untraced reference.
 */
export interface LegacyRun {
  /** The producer's i18n namespace, e.g. `plugin.md5`. */
  ns: string;
  algorithm: LegacyAlgorithm;
  message: readonly number[];
  detail: LegacyDetail;
}

interface ChainingValue {
  step: number;
  bytes: number[];
}

function createTrace(run: LegacyRun, paddedBytes: number): LegacyTrace {
  const { ns, algorithm, message } = run;
  const regions = legacyRegions(ns, algorithm, message.length, paddedBytes);
  const recorder = new WordopsRecorder<LegacyRegion, { op: LegacyOpName }>(regions, initialSnapshot(regions, { message }), scopeLevels(ns, 'block', 'op'), legacyInitialNarration(run, message.length));
  return legacyTrace(ns, algorithm, recorder);
}

function recordBlockBody(trace: LegacyTrace, blockIndex: number, block: LegacyBlock, detail: LegacyDetail): void {
  if (detail === 'block') {
    recordCompress(trace, blockIndex, block);
    return;
  }
  block.events.forEach((event) => (event.kind === 'schedule' ? recordSchedule(trace, event) : recordRound(trace, blockIndex, event)));
}

/** Block n's init, rounds (or compress) and feed-forward; returns H(n) with its feed-forward step. */
function recordBlock(trace: LegacyTrace, detail: LegacyDetail, index: number, block: LegacyBlock): ChainingValue {
  recordInit(trace, index, block);
  recordBlockBody(trace, index, block, detail);
  return { step: recordFeedForward(trace, index, block), bytes: wordsToBytes(WORD32, block.hOut, trace.algorithm.byteOrder) };
}

interface LegacyResult {
  chain: ChainingValue[];
  digest: number[];
  outputStep: number;
}

/** Records every block in its own scope: `pad` opens block 1, `output` closes the last block. */
function recordBlocks(trace: LegacyTrace, run: LegacyRun, padding: Sha2Padding): LegacyResult {
  const { algorithm } = run;
  const blocks = blocksOf(padding.padded, LEGACY_BLOCK_BYTES);
  let h = [...algorithm.iv];
  const chainBlock = (index: number): ChainingValue => {
    const block = algorithm.compressDetailed(h, blocks[index]!);
    h = block.hOut;
    if (index === 0) recordPad(trace, run.message.length, padding, LEGACY_BLOCK_BYTES);
    return recordBlock(trace, run.detail, index, block);
  };
  const lastIndex = blocks.length - 1;
  const chain = allIndices(lastIndex).map((index) => trace.recorder.block(index, () => chainBlock(index)));
  return trace.recorder.block(lastIndex, () => {
    const last = chainBlock(lastIndex);
    const digest = last.bytes.slice(0, algorithm.outputSize);
    return { chain: [...chain, last], digest, outputStep: recordOutput(trace, blocks.length, digest) };
  });
}

function legacyValues(run: LegacyRun, { chain, digest, outputStep }: LegacyResult): ValuesFacet {
  const { ns, message, algorithm } = run;
  const chaining: ValueRef[] = chain.map(({ step, bytes }, index) => ({ id: chainingValueId(index + 1), labelKey: `${ns}.value.h`, role: 'public', bytes, createdAt: step }));
  return {
    kind: 'values',
    schemaVersion: 1,
    values: [
      ...(message.length > 0 ? [valueRef(ns, 'message', 'public', [...message], INITIAL_STEP_INDEX)] : []),
      valueRef(ns, 'iv', 'constant', wordsToBytes(WORD32, algorithm.iv, algorithm.byteOrder), INITIAL_STEP_INDEX),
      ...chaining,
      valueRef(ns, 'digest', 'public', digest, outputStep),
    ],
  };
}

/** The recorder's wordops facet as schema v2 (transfers, emphasis and the v2 ops need it). */
function wordopsV2(trace: LegacyTrace): WordopsFacet {
  return { ...trace.recorder.wordopsFacet(32, trace.algorithm.registerNames), schemaVersion: 2 };
}

/** Records `run` and returns its facets and `{ digest }`; throws if the trace disagrees with the untraced reference. */
export function recordLegacy(run: LegacyRun): PrimitiveRecording {
  const padding = run.algorithm.padding(run.message);
  const trace = createTrace(run, padding.padded.length);
  const result = recordBlocks(trace, run, padding);
  assertMatchesReference(result.digest, run.algorithm.digest(Uint8Array.from(run.message)), run.algorithm.id);
  const state = trace.recorder.stateFacet();
  return {
    facets: { state, values: legacyValues(run, result), narration: narrationFromState(state), wordops: wordopsV2(trace) },
    output: { digest: result.digest },
  };
}
