import type { I18nRef, RegionSpec, Snapshot, StepInput, Tracer, Write } from '@cryventure/core';
import type { CellMove } from './ops.ts';
import { BLOCK_BYTES, STATE_COLUMNS, STATE_ROWS } from './state.ts';
import { WORDS_PER_ROUND_KEY } from './keyExpansion.ts';

/** Trace vocabulary of the AES producer: regions, ops and the step emitter. */
export type AesRegion = 'state' | 'roundKey' | 'w';

export type TraceDetail = 'round' | 'op';

export type AesOp =
  | { op: 'input'; round: number }
  | { op: 'keyExpansion'; round: number }
  | { op: 'addRoundKey'; round: number; roundKeyIndex: number }
  | { op: 'subBytes'; round: number }
  | { op: 'shiftRows'; round: number; moves: CellMove[] }
  | { op: 'mixColumns'; round: number }
  | { op: 'invSubBytes'; round: number }
  | { op: 'invShiftRows'; round: number; moves: CellMove[] }
  | { op: 'invMixColumns'; round: number }
  | { op: 'output'; round: number }
  | { op: 'round'; round: number };

export type AesOpName = AesOp['op'];

/** Every op name the trace can emit (cipher and inverse cipher, both detail levels). */
export const AES_OP_NAMES = [
  'input',
  'keyExpansion',
  'addRoundKey',
  'subBytes',
  'shiftRows',
  'mixColumns',
  'invSubBytes',
  'invShiftRows',
  'invMixColumns',
  'output',
  'round',
] as const satisfies readonly AesOpName[];

/** Label key of an op name (debugger breakpoints, op pickers): `plugin.aes.op.<op>`. */
export function opLabelKey(op: AesOpName): string {
  return `plugin.aes.op.${op}`;
}

/** Compact op name for the player's scope path ("Round 1 · SubBytes"): `plugin.aes.opShort.<op>`. */
export function opShortLabelKey(op: AesOpName): string {
  return `plugin.aes.opShort.${op}`;
}

/**
 * Labels of the scope levels [round, op]: the round template uses `{{value}}` (round 0 is real),
 * the op template `{{ordinal}}` (1-based); the player prefers the op's `opShort` label at the op level.
 */
export const AES_SCOPE_LEVELS: { labelKey: string }[] = [
  { labelKey: 'plugin.aes.scope.round' },
  { labelKey: 'plugin.aes.scope.op' },
];

export type AesStep = StepInput<AesRegion, AesOp>;
export type AesTracer = Tracer<AesRegion, AesOp>;

const BYTES_PER_WORD = 4;

/** Region layout: state and round key as col-major 4×4, the key schedule as one row per word. */
export function aesRegions(rounds: number): RegionSpec<AesRegion>[] {
  return [
    {
      id: 'state',
      labelKey: 'plugin.aes.region.state',
      elem: 'u8',
      shape: [STATE_ROWS, STATE_COLUMNS],
      order: 'col-major',
    },
    {
      id: 'roundKey',
      labelKey: 'plugin.aes.region.roundKey',
      elem: 'u8',
      shape: [STATE_ROWS, STATE_COLUMNS],
      order: 'col-major',
    },
    {
      id: 'w',
      labelKey: 'plugin.aes.region.w',
      elem: 'u8',
      shape: [WORDS_PER_ROUND_KEY * (rounds + 1), BYTES_PER_WORD],
      order: 'row-major',
    },
  ];
}

/** All-zero initial snapshot matching `aesRegions(rounds)`. */
export function emptySnapshot(rounds: number): Snapshot<AesRegion> {
  return {
    state: new Array<number>(BLOCK_BYTES).fill(0),
    roundKey: new Array<number>(BLOCK_BYTES).fill(0),
    w: new Array<number>(BLOCK_BYTES * (rounds + 1)).fill(0),
  };
}

function writeIdentity(write: Write<AesRegion>): string {
  return `${write.region}:${write.offset}:${write.values.length}`;
}

/**
 * Feeds steps to a tracer at the requested detail. At 'op' detail each op becomes a step in
 * scope [round, opIndex]; at 'round' detail a round's writes are merged into one step in scope [round].
 * Step builders are thunks so a disabled tracer costs nothing.
 */
export class AesTraceEmitter {
  private readonly pendingWrites = new Map<string, Write<AesRegion>>();

  constructor(
    private readonly tracer: AesTracer,
    private readonly detail: TraceDetail,
  ) {}

  beginRound(round: number): void {
    this.pendingWrites.clear();
    this.tracer.enter(round);
  }

  emit(buildStep: () => AesStep): void {
    if (!this.tracer.enabled) return;
    const step = buildStep();
    if (this.detail === 'op') this.emitOpStep(step);
    else step.writes.forEach((write) => this.pendingWrites.set(writeIdentity(write), write));
  }

  endRound(round: number, narration: I18nRef): void {
    if (this.tracer.enabled && this.detail === 'round') this.emitRoundStep(round, narration);
    this.tracer.leave();
  }

  private emitOpStep(step: AesStep): void {
    this.tracer.enter();
    this.tracer.step(step);
    this.tracer.leave();
  }

  private emitRoundStep(round: number, narration: I18nRef): void {
    const writes = [...this.pendingWrites.values()];
    const stateIndices = Array.from({ length: BLOCK_BYTES }, (_, i) => i);
    this.tracer.step({
      op: 'round',
      round,
      writes,
      highlights: [{ region: 'state', indices: stateIndices, kind: 'write' }],
      narration,
    });
  }
}
