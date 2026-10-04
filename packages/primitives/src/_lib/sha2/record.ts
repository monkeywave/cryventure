import {
  assertMatchesReference,
  i18nRef,
  INITIAL_STEP_INDEX,
  narrationFromState,
  parseHexToArray,
  scopeLevels,
  utf8Bytes,
  valueRef,
  type PrimitiveRecording,
  type ValueRef,
  type ValuesFacet,
} from '@cryventure/core';
import type { Sha2Algorithm } from './algorithms.ts';
import { compressDetailed, type BlockDetail } from './compress.ts';
import { sha2Digest } from './hash.ts';
import { sha2Padding, type Sha2Padding } from './padding.ts';
import { SHA2_REGISTER_NAMES, sha2InitialSnapshot, sha2Regions, type Sha2Region } from './regions.ts';
import { chainingValueId, recordCompress, recordFeedForward, recordInit, recordOutput, recordPad, recordRound, recordSchedule, sha2Trace, type Sha2OpName, type Sha2Trace } from './steps.ts';
import { WordopsRecorder } from './wordopsRecorder.ts';
import { wordsToBytes, type Word } from './words.ts';

/**
 * Records one SHA-2 run into the `state`, `values`, `narration` and `wordops` facets and the
 * `{ digest }` output (docs/M5.md §2b–2d), checked against the untraced reference. Shared by the
 * `sha256` and `sha512` producers; only the namespace and the algorithm differ.
 */
export type Sha2Detail = 'round' | 'block';
export type Sha2Encoding = 'utf8' | 'hex';

export interface Sha2Run<W extends Word> {
  /** The producer's i18n namespace, e.g. `plugin.sha256`. */
  ns: string;
  algorithm: Sha2Algorithm<W>;
  message: readonly number[];
  detail: Sha2Detail;
}

/** The message bytes of a validated `input` (UTF-8 text, or hex already normalised by `validate`). */
export function sha2MessageBytes(encoding: Sha2Encoding, input: string): number[] {
  return encoding === 'utf8' ? Array.from(utf8Bytes(input)) : parseHexToArray(input);
}

interface ChainingValue {
  step: number;
  bytes: number[];
}

function createTrace<W extends Word>(run: Sha2Run<W>, paddedBytes: number): Sha2Trace<W> {
  const { ns, algorithm, message } = run;
  const regions = sha2Regions(ns, algorithm, message.length, paddedBytes);
  const initialNarration = i18nRef(`${ns}.step.initial`, { algorithm: algorithm.name, bytes: message.length, bits: algorithm.outputSize * 8, blockBits: algorithm.params.blockBytes * 8, rounds: algorithm.params.rounds });
  const recorder = new WordopsRecorder<Sha2Region, { op: Sha2OpName }>(regions, sha2InitialSnapshot(regions, message), scopeLevels(ns, 'block', 'op'), initialNarration);
  return sha2Trace(ns, algorithm, recorder);
}

function recordBlockBody<W extends Word>(trace: Sha2Trace<W>, blockIndex: number, block: BlockDetail<W>, detail: Sha2Detail): void {
  if (detail === 'block') {
    recordCompress(trace, blockIndex, block);
    return;
  }
  block.events.forEach((event) => (event.kind === 'schedule' ? recordSchedule(trace, event) : recordRound(trace, event)));
}

/** Block n's init, rounds (or compress) and feed-forward; returns H^(n) with its feed-forward step. */
function recordBlock<W extends Word>(trace: Sha2Trace<W>, run: Sha2Run<W>, index: number, block: BlockDetail<W>): ChainingValue {
  recordInit(trace, index, block);
  recordBlockBody(trace, index, block, run.detail);
  return { step: recordFeedForward(trace, index, block), bytes: wordsToBytes(run.algorithm.params.arith, block.hOut) };
}

interface Sha2Result {
  chain: ChainingValue[];
  digest: number[];
  outputStep: number;
}

/** The digest (H^(N) truncated to `outputSize`) and its `output` step. */
function recordDigest<W extends Word>(trace: Sha2Trace<W>, last: ChainingValue, blockCount: number): Pick<Sha2Result, 'digest' | 'outputStep'> {
  const digest = last.bytes.slice(0, trace.algorithm.outputSize);
  return { digest, outputStep: recordOutput(trace, blockCount, digest) };
}

/** Records every block in its own scope: `pad` opens block 1, `output` closes the last block. */
function recordBlocks<W extends Word>(trace: Sha2Trace<W>, run: Sha2Run<W>, padding: Sha2Padding): Sha2Result {
  const { params, iv } = run.algorithm;
  const blocks = Array.from({ length: padding.padded.length / params.blockBytes }, (_, index) => padding.padded.subarray(index * params.blockBytes, (index + 1) * params.blockBytes));
  const result: Sha2Result = { chain: [], digest: [], outputStep: -1 };
  let h = [...iv];
  blocks.forEach((bytes, index) => {
    const block = compressDetailed(params, h, bytes);
    trace.recorder.enter(index);
    if (index === 0) recordPad(trace, run.message.length, padding);
    result.chain.push(recordBlock(trace, run, index, block));
    if (index === blocks.length - 1) Object.assign(result, recordDigest(trace, result.chain[index]!, blocks.length));
    trace.recorder.leave();
    h = block.hOut;
  });
  return result;
}

function sha2Values<W extends Word>(run: Sha2Run<W>, chain: readonly ChainingValue[], digest: number[], outputStep: number): ValuesFacet {
  const { ns, algorithm, message } = run;
  const chaining: ValueRef[] = chain.map(({ step, bytes }, index) => ({ id: chainingValueId(index + 1), labelKey: `${ns}.value.h`, role: 'public', bytes, createdAt: step }));
  return {
    kind: 'values',
    schemaVersion: 1,
    values: [
      ...(message.length > 0 ? [valueRef(ns, 'message', 'public', [...message], INITIAL_STEP_INDEX)] : []),
      valueRef(ns, 'iv', 'constant', wordsToBytes(algorithm.params.arith, algorithm.iv), INITIAL_STEP_INDEX),
      ...chaining,
      valueRef(ns, 'digest', 'public', digest, outputStep),
    ],
  };
}

/** Records `run` and returns its facets and `{ digest }`; throws if the trace disagrees with the untraced reference. */
export function recordSha2<W extends Word>(run: Sha2Run<W>): PrimitiveRecording {
  const padding = sha2Padding(run.message, run.algorithm.params.blockBytes);
  const trace = createTrace(run, padding.padded.length);
  const { chain, digest, outputStep } = recordBlocks(trace, run, padding);
  assertMatchesReference(digest, sha2Digest(run.algorithm as Sha2Algorithm<number> | Sha2Algorithm<bigint>, Uint8Array.from(run.message)), run.algorithm.id);
  const state = trace.recorder.stateFacet();
  return {
    facets: { state, values: sha2Values(run, chain, digest, outputStep), narration: narrationFromState(state), wordops: trace.recorder.wordopsFacet(run.algorithm.params.wordBits, SHA2_REGISTER_NAMES) },
    output: { digest },
  };
}
