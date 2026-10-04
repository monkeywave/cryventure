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
} from '@cryventure/core';
import type { AnySha2Algorithm, Sha2Algorithm } from './algorithms.ts';
import { compressDetailed, type BlockDetail } from './compress.ts';
import type { Sha2Detail } from './manifestKit.ts';
import { sha2Digest } from './hash.ts';
import { sha2Padding, type Sha2Padding } from './padding.ts';
import { initialSnapshot, SHA2_REGISTER_NAMES, sha2Regions, type Sha2Region } from './regions.ts';
import {
  chainingValueId,
  recordCompress,
  recordFeedForward,
  recordInit,
  recordOutput,
  recordPad,
  recordRound,
  recordSchedule,
  sha2InitialNarration,
  sha2Trace,
  type Sha2OpName,
  type Sha2Trace,
  type Sha2TraceOptions,
} from './steps.ts';
import { WordopsRecorder } from './wordopsRecorder.ts';
import { wordsToBytes, type Word } from './words.ts';

/**
 * Records one SHA-2 run into the `state`, `values`, `narration` and `wordops` facets and the
 * `{ digest }` output (docs/M5.md §2b–2d), checked against the untraced reference. Shared by the
 * `sha256` and `sha512` producers; only the namespace and the algorithm differ.
 */
export interface Sha2Run<W extends Word> {
  /** The producer's i18n namespace, e.g. `plugin.sha256`. */
  ns: string;
  algorithm: Sha2Algorithm<W>;
  message: readonly number[];
  detail: Sha2Detail;
  /** Optional round terms (`sha512` adds hKW, docs/M6.md §2f). */
  options?: Sha2TraceOptions;
}

interface ChainingValue {
  step: number;
  bytes: number[];
}

function createTrace<W extends Word>(run: Sha2Run<W>, paddedBytes: number): Sha2Trace<W> {
  const { ns, algorithm, message } = run;
  const regions = sha2Regions(ns, algorithm, message.length, paddedBytes);
  const initialNarration = sha2InitialNarration(ns, algorithm, message.length);
  const recorder = new WordopsRecorder<Sha2Region, { op: Sha2OpName }>(regions, initialSnapshot(regions, { message }), scopeLevels(ns, 'block', 'op'), initialNarration);
  return sha2Trace(ns, algorithm, recorder, run.options);
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
  const blocks = blocksOf(padding.padded, params.blockBytes);
  let h = [...iv];
  const chainBlock = (index: number): ChainingValue => {
    const block = compressDetailed(params, h, blocks[index]!);
    h = block.hOut;
    if (index === 0) recordPad(trace, run.message.length, padding, params.blockBytes);
    return recordBlock(trace, run, index, block);
  };
  const lastIndex = blocks.length - 1;
  const chain = allIndices(lastIndex).map((index) => trace.recorder.block(index, () => chainBlock(index)));
  return trace.recorder.block(lastIndex, () => {
    const last = chainBlock(lastIndex);
    return { chain: [...chain, last], ...recordDigest(trace, last, blocks.length) };
  });
}

/** The start value: H(0), or H(0)″ (labelled `<ns>.value.ivIvGeneration`) for the SHA-512/t IV generation function (§5.3.6). */
function ivValue<W extends Word>({ ns, algorithm }: Sha2Run<W>): ValueRef {
  const iv = valueRef(ns, 'iv', 'constant', wordsToBytes(algorithm.params.arith, algorithm.iv), INITIAL_STEP_INDEX);
  return algorithm.ivGeneration === undefined ? iv : { ...iv, labelKey: `${ns}.value.ivIvGeneration` };
}

function sha2Values<W extends Word>(run: Sha2Run<W>, chain: readonly ChainingValue[], digest: number[], outputStep: number): ValuesFacet {
  const { ns, message } = run;
  const chaining: ValueRef[] = chain.map(({ step, bytes }, index) => ({ id: chainingValueId(index + 1), labelKey: `${ns}.value.h`, role: 'public', bytes, createdAt: step }));
  return {
    kind: 'values',
    schemaVersion: 1,
    values: [
      ...(message.length > 0 ? [valueRef(ns, 'message', 'public', [...message], INITIAL_STEP_INDEX)] : []),
      ivValue(run),
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
  assertMatchesReference(digest, sha2Digest(run.algorithm as AnySha2Algorithm, Uint8Array.from(run.message)), run.algorithm.id);
  const state = trace.recorder.stateFacet();
  return {
    facets: { state, values: sha2Values(run, chain, digest, outputStep), narration: narrationFromState(state), wordops: trace.recorder.wordopsFacet(run.algorithm.params.arith.bits, SHA2_REGISTER_NAMES) },
    output: { digest },
  };
}
