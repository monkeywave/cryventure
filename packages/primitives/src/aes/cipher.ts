import { i18nRef, NullTracer, type I18nRef } from '@cryventure/core';
import {
  AesTraceEmitter,
  type AesOp,
  type AesRegion,
  type AesStep,
  type AesTracer,
  type TraceDetail,
} from './aesTrace.ts';
import { keySchedule, roundKeyBytes, type KeySchedule } from './keyExpansion.ts';
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
  keyExpansionStep,
  outputStep,
  shiftStep,
  stepKey,
  wholeStateStep,
  type WholeStateOp,
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

/** A transform that rewrites the whole state and is traced by `wholeStateStep(op, …)`. */
function wholeStateTransform(op: WholeStateOp, apply: (state: AesState) => AesState): Transform {
  return (state, round) => {
    const next = apply(state);
    return { state: next, step: () => wholeStateStep(op, round, next) };
  };
}

function shiftTransform(
  op: 'shiftRows' | 'invShiftRows',
  apply: typeof shiftRows,
): Transform {
  return (state, round) => {
    const { state: next, moves } = apply(state);
    return { state: next, step: () => shiftStep(op, round, next, moves) };
  };
}

const addRoundKeyTransform: Transform = (state, round, key) => {
  const next = addRoundKey(state, key.bytes);
  return { state: next, step: () => addRoundKeyStep(round, key.index, key.bytes, next) };
};

const TRANSFORMS: Record<TransformName, Transform> = {
  subBytes: wholeStateTransform('subBytes', subBytes),
  invSubBytes: wholeStateTransform('invSubBytes', invSubBytes),
  shiftRows: shiftTransform('shiftRows', shiftRows),
  invShiftRows: shiftTransform('invShiftRows', invShiftRows),
  mixColumns: wholeStateTransform('mixColumns', mixColumns),
  invMixColumns: wholeStateTransform('invMixColumns', invMixColumns),
  addRoundKey: addRoundKeyTransform,
};

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
  schedule: KeySchedule;
  emitter: AesTraceEmitter;
}

function roundKeyFor(run: CipherRun, round: number): RoundKey {
  const index = run.direction.roundKeyIndex(round, run.schedule.rounds);
  return { index, bytes: roundKeyBytes(run.schedule.words, index) };
}

function roundNarration(run: CipherRun, round: number): I18nRef {
  const { narration } = run.direction;
  if (round === 0) return i18nRef(narration.initial, { roundKey: roundKeyFor(run, 0).index });
  return i18nRef(round === run.schedule.rounds ? narration.final : narration.middle, { round });
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

function initialRound(run: CipherRun, input: AesState): AesState {
  run.emitter.beginRound(0);
  run.emitter.emit(() => wholeStateStep('input', 0, input));
  run.emitter.emit(() => keyExpansionStep(0, run.schedule.words, run.schedule.keyWords));
  const state = applyTransforms(run, input, 0, ['addRoundKey']);
  run.emitter.endRound(0, roundNarration(run, 0));
  return state;
}

function cipherRound(run: CipherRun, state: AesState, round: number): AesState {
  const isFinal = round === run.schedule.rounds;
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
  schedule: KeySchedule,
  block: ArrayLike<number>,
  tracer: AesTracer,
  detail: TraceDetail,
): number[] {
  const run: CipherRun = {
    direction,
    schedule,
    emitter: new AesTraceEmitter(tracer, detail),
  };
  let state = initialRound(run, bytesToState(block));
  for (let round = 1; round <= run.schedule.rounds; round++) state = cipherRound(run, state, round);
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
  return encryptWithSchedule(keySchedule(key), plaintext, tracer, detail);
}

/** `encryptBlock` with an already expanded key (lets a run expand the key once and share it). */
export function encryptWithSchedule(
  schedule: KeySchedule,
  plaintext: ArrayLike<number>,
  tracer: AesTracer = nullTracer(),
  detail: TraceDetail = 'op',
): number[] {
  return runCipher(ENCRYPT, schedule, plaintext, tracer, detail);
}

/** Decrypts one 16-byte block with the straightforward InvCipher. */
export function decryptBlock(
  key: ArrayLike<number>,
  ciphertext: ArrayLike<number>,
  tracer: AesTracer = nullTracer(),
  detail: TraceDetail = 'op',
): number[] {
  return runCipher(DECRYPT, keySchedule(key), ciphertext, tracer, detail);
}
