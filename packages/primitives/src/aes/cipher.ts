import { i18nRef, NullTracer, type I18nRef } from '@cryventure/core';
import {
  AesTraceEmitter,
  type AesOp,
  type AesRegion,
  type AesStep,
  type AesTracer,
  type TraceDetail,
} from './aesTrace.ts';
import { expandKey, roundKeyBytes, WORDS_PER_ROUND_KEY, type Word } from './keyExpansion.ts';
import {
  addRoundKey,
  invMixColumns,
  invShiftRows,
  invSubBytes,
  mixColumns,
  shiftRows,
  subBytes,
} from './ops.ts';
import { bytesToState, stateToBytes, type AesState } from './state.ts';
import {
  addRoundKeyStep,
  inputStep,
  keyExpansionStep,
  mixStep,
  outputStep,
  shiftStep,
  stepKey,
  substitutionStep,
} from './steps.ts';

/**
 * AES Cipher and InvCipher (FIPS 197 §5.1 / §5.3) emitting trace steps.
 * Educational implementation: table lookups and branches are NOT constant-time.
 */
type TransformName =
  | 'subBytes'
  | 'shiftRows'
  | 'mixColumns'
  | 'addRoundKey'
  | 'invSubBytes'
  | 'invShiftRows'
  | 'invMixColumns';

interface RoundKey {
  index: number;
  bytes: number[];
}

interface TransformResult {
  state: AesState;
  step: () => AesStep;
}

type Transform = (state: AesState, round: number, key: RoundKey) => TransformResult;

const TRANSFORMS: Record<TransformName, Transform> = {
  subBytes: (s, round) =>
    withStep(subBytes(s), (next) => substitutionStep('subBytes', round, next)),
  invSubBytes: (s, round) =>
    withStep(invSubBytes(s), (next) => substitutionStep('invSubBytes', round, next)),
  shiftRows: (s, round) =>
    shifted(shiftRows(s), (r) => shiftStep('shiftRows', round, r.state, r.moves)),
  invShiftRows: (s, round) =>
    shifted(invShiftRows(s), (r) => shiftStep('invShiftRows', round, r.state, r.moves)),
  mixColumns: (s, round) => withStep(mixColumns(s), (next) => mixStep('mixColumns', round, next)),
  invMixColumns: (s, round) =>
    withStep(invMixColumns(s), (next) => mixStep('invMixColumns', round, next)),
  addRoundKey: (s, round, key) =>
    withStep(addRoundKey(s, key.bytes), (next) =>
      addRoundKeyStep(round, key.index, key.bytes, next),
    ),
};

function withStep(state: AesState, build: (state: AesState) => AesStep): TransformResult {
  return { state, step: () => build(state) };
}

function shifted<T extends { state: AesState }>(
  result: T,
  build: (result: T) => AesStep,
): TransformResult {
  return { state: result.state, step: () => build(result) };
}

interface Direction {
  middleRound: readonly TransformName[];
  finalRound: readonly TransformName[];
  roundKeyIndex(round: number, rounds: number): number;
  narration: { initial: string; middle: string; final: string };
}

const ENCRYPT: Direction = {
  middleRound: ['subBytes', 'shiftRows', 'mixColumns', 'addRoundKey'],
  finalRound: ['subBytes', 'shiftRows', 'addRoundKey'],
  roundKeyIndex: (round) => round,
  narration: {
    initial: stepKey('roundInitial'),
    middle: stepKey('round'),
    final: stepKey('roundFinal'),
  },
};

const DECRYPT: Direction = {
  middleRound: ['invShiftRows', 'invSubBytes', 'addRoundKey', 'invMixColumns'],
  finalRound: ['invShiftRows', 'invSubBytes', 'addRoundKey'],
  roundKeyIndex: (round, rounds) => rounds - round,
  narration: {
    initial: stepKey('roundInitial'),
    middle: stepKey('invRound'),
    final: stepKey('invRoundFinal'),
  },
};

interface CipherRun {
  direction: Direction;
  words: Word[];
  rounds: number;
  emitter: AesTraceEmitter;
}

function roundKeyFor(run: CipherRun, round: number): RoundKey {
  const index = run.direction.roundKeyIndex(round, run.rounds);
  return { index, bytes: roundKeyBytes(run.words, index) };
}

function roundNarration(run: CipherRun, round: number): I18nRef {
  const { narration } = run.direction;
  if (round === 0) return i18nRef(narration.initial, { roundKey: roundKeyFor(run, 0).index });
  return i18nRef(round === run.rounds ? narration.final : narration.middle, { round });
}

function applyTransforms(
  run: CipherRun,
  state: AesState,
  round: number,
  names: readonly TransformName[],
): AesState {
  const key = roundKeyFor(run, round);
  return names.reduce((current, name) => {
    const result = TRANSFORMS[name](current, round, key);
    run.emitter.emit(result.step);
    return result.state;
  }, state);
}

function initialRound(run: CipherRun, input: AesState, keyWords: number): AesState {
  run.emitter.beginRound(0);
  run.emitter.emit(() => inputStep(0, input));
  run.emitter.emit(() => keyExpansionStep(0, run.words, keyWords));
  const state = applyTransforms(run, input, 0, ['addRoundKey']);
  run.emitter.endRound(0, roundNarration(run, 0));
  return state;
}

function cipherRound(run: CipherRun, state: AesState, round: number): AesState {
  const isFinal = round === run.rounds;
  run.emitter.beginRound(round);
  const next = applyTransforms(
    run,
    state,
    round,
    isFinal ? run.direction.finalRound : run.direction.middleRound,
  );
  if (isFinal) run.emitter.emit(() => outputStep(round));
  run.emitter.endRound(round, roundNarration(run, round));
  return next;
}

function runCipher(
  direction: Direction,
  key: ArrayLike<number>,
  block: ArrayLike<number>,
  tracer: AesTracer,
  detail: TraceDetail,
): number[] {
  const words = expandKey(key);
  const run: CipherRun = {
    direction,
    words,
    rounds: words.length / WORDS_PER_ROUND_KEY - 1,
    emitter: new AesTraceEmitter(tracer, detail),
  };
  let state = initialRound(run, bytesToState(block), key.length / 4);
  for (let round = 1; round <= run.rounds; round++) state = cipherRound(run, state, round);
  return stateToBytes(state);
}

function nullTracer(): AesTracer {
  return new NullTracer<AesRegion, AesOp>();
}

/** Encrypts one 16-byte block; steps go to `tracer` (scope [round] or [round, opIndex]). */
export function encryptBlock(
  key: ArrayLike<number>,
  plaintext: ArrayLike<number>,
  tracer: AesTracer = nullTracer(),
  detail: TraceDetail = 'op',
): number[] {
  return runCipher(ENCRYPT, key, plaintext, tracer, detail);
}

/** Decrypts one 16-byte block with the straightforward InvCipher. */
export function decryptBlock(
  key: ArrayLike<number>,
  ciphertext: ArrayLike<number>,
  tracer: AesTracer = nullTracer(),
  detail: TraceDetail = 'op',
): number[] {
  return runCipher(DECRYPT, key, ciphertext, tracer, detail);
}
