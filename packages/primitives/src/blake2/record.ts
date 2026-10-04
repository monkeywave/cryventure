import {
  assertMatchesReference,
  i18nRef,
  INITIAL_STEP_INDEX,
  narrationFromState,
  scopeLevels,
  valueRef,
  type I18nRef,
  type PrimitiveRecording,
  type ScopeLevel,
  type ValuesFacet,
} from '@cryventure/core';
import { blake2Blocks, type Blake2BlockPlan } from '../_lib/blake2/blocks.ts';
import { compressDetailed, type Blake2BlockDetail } from '../_lib/blake2/compress.ts';
import { parameterWord0 } from '../_lib/blake2/constants.ts';
import { blake2Hash } from '../_lib/blake2/hash.ts';
import type { Blake2Detail } from '../_lib/blake2/manifestKit.ts';
import type { AnyBlake2Algorithm, Blake2Algorithm } from '../_lib/blake2/variants.ts';
import { initialSnapshot } from '../_lib/sha2/regions.ts';
import { chainingValueId } from '../_lib/sha2/steps.ts';
import { wordsFromBytes, wordsToBytes, type Word } from '../_lib/sha2/words.ts';
import { Blake2Recorder } from './recorder.ts';
import { blake2Regions } from './regions.ts';
import { blake2Trace, recordCompress, recordFeedForward, recordG, recordInit, recordLoad, recordOutput, recordRound, type Blake2Trace } from './steps.ts';

/**
 * Records one BLAKE2 run into the `state`, `values`, `narration` and `wordops` (v2) facets and the
 * `{ digest }` output (docs/M6.md §2d), checked against the untraced reference. Scope levels:
 * `block → round → op` at `g` detail (G calls at `[block, round, i]`), `block → round` at `round`
 * detail, `block` at `block` detail; `init`, `load`, `feedForward` and `output` sit in their block.
 */
export interface Blake2Run<W extends Word> {
  ns: string;
  algorithm: Blake2Algorithm<W>;
  message: readonly number[];
  /** Empty = unkeyed. */
  key: readonly number[];
  detail: Blake2Detail;
}

const SCOPE_LEVELS: Readonly<Record<Blake2Detail, readonly string[]>> = { g: ['block', 'round', 'op'], round: ['block', 'round'], block: ['block'] };

function levelsOf(ns: string, detail: Blake2Detail): ScopeLevel[] {
  return scopeLevels(ns, ...SCOPE_LEVELS[detail]);
}

function initialNarration<W extends Word>({ ns, algorithm, message, key }: Blake2Run<W>): I18nRef {
  const { variant } = algorithm;
  const params = { algorithm: algorithm.name, bytes: message.length, bits: algorithm.outputSize * 8, blockBytes: variant.blockBytes, rounds: variant.rounds, wordBits: variant.arith.bits };
  return key.length > 0 ? i18nRef(`${ns}.step.initialKeyed`, { ...params, keyBytes: key.length }) : i18nRef(`${ns}.step.initial`, params);
}

function createTrace<W extends Word>(run: Blake2Run<W>): Blake2Trace<W> {
  const { ns, algorithm, message, key } = run;
  const regions = blake2Regions(ns, { messageBytes: message.length, keyBytes: key.length, wordBytes: algorithm.variant.arith.bytes, outputBytes: algorithm.outputSize });
  return blake2Trace(ns, algorithm, new Blake2Recorder(regions, initialSnapshot(regions, { message, key }), initialNarration(run)));
}

function recordBody<W extends Word>(trace: Blake2Trace<W>, blockIndex: number, block: Blake2BlockDetail<W>, detail: Blake2Detail): void {
  const { recorder } = trace;
  if (detail === 'block') {
    recordCompress(trace, blockIndex, block);
    return;
  }
  for (const round of block.rounds) {
    recorder.scope(round.r, () => (detail === 'round' ? recordRound(trace, round) : round.gs.forEach((g) => recorder.scope(g.i, () => recordG(trace, round.r, g)))));
  }
}

interface ChainingValue {
  step: number;
  bytes: number[];
}

interface Blake2Result {
  chain: ChainingValue[];
  digest: number[];
  outputStep: number;
}

/** Records `init` (block 0), every block's load, body and feed-forward, and the `output` (last block). */
function recordBlocks<W extends Word>(trace: Blake2Trace<W>, run: Blake2Run<W>, plans: readonly Blake2BlockPlan[]): Blake2Result {
  const { variant, outputSize } = trace.algorithm;
  const p0 = variant.word(parameterWord0(outputSize, run.key.length));
  let h = variant.iv.map((word, j) => (j === 0 ? variant.arith.xor(word, p0) : word));
  const chain: ChainingValue[] = [];
  let output = { digest: [] as number[], outputStep: -1 };
  plans.forEach((plan, index) =>
    trace.recorder.scope(index, () => {
      if (index === 0) recordInit(trace, p0, h, run.key.length);
      const block = compressDetailed(variant, h, wordsFromBytes(variant.arith, plan.bytes, 'little'), plan.t, plan.last);
      recordLoad(trace, index, plan, block, run.key.length);
      recordBody(trace, index, block, run.detail);
      h = block.hOut;
      const bytes = wordsToBytes(variant.arith, h, 'little');
      chain.push({ step: recordFeedForward(trace, index, block), bytes });
      if (plan.last) {
        const digest = bytes.slice(0, outputSize);
        output = { digest, outputStep: recordOutput(trace, plans.length, digest) };
      }
    }),
  );
  return { chain, ...output };
}

function blake2Values<W extends Word>(run: Blake2Run<W>, { chain, digest, outputStep }: Blake2Result): ValuesFacet {
  const { ns, message, key, algorithm } = run;
  const { arith, iv } = algorithm.variant;
  return {
    kind: 'values',
    schemaVersion: 1,
    values: [
      ...(message.length > 0 ? [valueRef(ns, 'message', 'public', [...message], INITIAL_STEP_INDEX)] : []),
      ...(key.length > 0 ? [valueRef(ns, 'key', 'key', [...key], INITIAL_STEP_INDEX)] : []),
      valueRef(ns, 'iv', 'constant', wordsToBytes(arith, iv, 'little'), INITIAL_STEP_INDEX),
      ...chain.map(({ step, bytes }, index) => ({ id: chainingValueId(index + 1), labelKey: `${ns}.value.h`, role: 'public' as const, bytes, createdAt: step })),
      valueRef(ns, 'digest', 'public', digest, outputStep),
    ],
  };
}

/** A run of either word size. */
export type AnyBlake2Run = Omit<Blake2Run<Word>, 'algorithm'> & { algorithm: AnyBlake2Algorithm };

/** Records `run` and returns its facets and `{ digest }`; throws if the trace disagrees with the untraced reference. */
export function recordBlake2(run: AnyBlake2Run): PrimitiveRecording {
  return recordRun(run as Blake2Run<Word>);
}

function recordRun<W extends Word>(run: Blake2Run<W>): PrimitiveRecording {
  const trace = createTrace(run);
  const result = recordBlocks(trace, run, blake2Blocks(run.message, run.key, run.algorithm.variant.blockBytes));
  assertMatchesReference(result.digest, blake2Hash(run.algorithm.id, Uint8Array.from(run.message), Uint8Array.from(run.key)), run.algorithm.id);
  const state = trace.recorder.stateFacet(levelsOf(run.ns, run.detail));
  return {
    facets: { state, values: blake2Values(run, result), narration: narrationFromState(state), wordops: trace.recorder.wordopsFacet(run.algorithm.variant.arith.bits) },
    output: { digest: result.digest },
  };
}
