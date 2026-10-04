import { RegisterFile } from '../registerFile.ts';
import {
  KECCAK_LANE_BYTES,
  laneBytes,
  spongeStepAt,
  type KeccakPermutation,
  type KeccakTrace,
} from './keccakTrace.ts';

/**
 * What a 64-bit half of a vector register holds while the Keccak listing runs, as a **reference into
 * the trace** (docs/M6.md §5c): a lane after some sponge step, a θ intermediate (`partial`, C, D) or
 * ι's round constant. The walker checks every instruction's inputs against these references and turns
 * them into bytes only through `valueBytes`, which reads the trace; nothing here computes Keccak.
 */
export type KeccakValue =
  | { kind: 'zero' }
  /** `lanes[lane]` after the sponge step at state step `step`. */
  | { kind: 'lane'; step: number; lane: number }
  /** `theta[part][x]` of the θ step at `step`. */
  | { kind: 'theta'; step: number; part: 'partial' | 'c' | 'd'; x: number }
  /** `iota.rc` of the ι step at `step`. */
  | { kind: 'rc'; step: number };

/** A 128-bit vector register: the low and the high 64-bit half (lane 0 and lane 1 of `.2d`). */
export interface KeccakRegister {
  low: KeccakValue;
  high: KeccakValue;
}

export const ZERO: KeccakValue = { kind: 'zero' };

/** A register holding `value` in its low half and zero above (a `d`-register load, a lane op). */
export const lowHalf = (value: KeccakValue): KeccakRegister => ({ low: value, high: ZERO });

function sameValue(a: KeccakValue, b: KeccakValue): boolean {
  switch (a.kind) {
    case 'zero':
      return b.kind === 'zero';
    case 'lane':
      return b.kind === 'lane' && a.step === b.step && a.lane === b.lane;
    case 'theta':
      return b.kind === 'theta' && a.step === b.step && a.part === b.part && a.x === b.x;
    case 'rc':
      return b.kind === 'rc' && a.step === b.step;
  }
}

export function describeValue(value: KeccakValue): string {
  switch (value.kind) {
    case 'zero':
      return '0';
    case 'lane':
      return `lane ${value.lane}@${value.step}`;
    case 'theta':
      return `${value.part}[${value.x}]@${value.step}`;
    case 'rc':
      return `RC@${value.step}`;
  }
}

/** Throws unless `actual` holds `expected`. */
export function expectValue(actual: KeccakValue, expected: KeccakValue, what: string): void {
  if (!sameValue(actual, expected))
    throw new Error(`${what}: expected ${describeValue(expected)}, holds ${describeValue(actual)}`);
}

/** Throws unless `actual` holds the values of `expected` in any order (XOR is commutative). */
export function expectValueSet(
  actual: readonly KeccakValue[],
  expected: readonly KeccakValue[],
  what: string,
): void {
  const key = (values: readonly KeccakValue[]) => values.map(describeValue).sort().join(', ');
  if (key(actual) !== key(expected))
    throw new Error(`${what}: expected {${key(expected)}}, holds {${key(actual)}}`);
}

/**
 * Lane `lane` of the state a permutation's round `round` starts from (`round` = rounds: its result).
 * Round 0 reads the entry step; later rounds read χ of the round before, except lane 0, which ι
 * changes last (ι leaves the other 24 lanes as χ wrote them).
 */
export function roundInput(
  permutation: KeccakPermutation,
  round: number,
  lane: number,
): KeccakValue {
  if (round === 0) return { kind: 'lane', step: permutation.entry, lane };
  const previous = permutation.rounds[round - 1]!;
  const step = lane === 0 ? previous.iota.step : previous.chi.step;
  return { kind: 'lane', step, lane };
}

/** The 8 bytes (little-endian, memory order) the trace records for `value`, parsed once per trace and value. */
export function valueBytes(
  trace: Pick<KeccakTrace, 'byStep' | 'valueBytes'>,
  value: KeccakValue,
): readonly number[] {
  const key = describeValue(value);
  let bytes = trace.valueBytes.get(key);
  if (bytes === undefined) {
    bytes = readValueBytes(trace, value);
    trace.valueBytes.set(key, bytes);
  }
  return bytes;
}

function readValueBytes(trace: Pick<KeccakTrace, 'byStep'>, value: KeccakValue): number[] {
  switch (value.kind) {
    case 'zero':
      return new Array<number>(KECCAK_LANE_BYTES).fill(0);
    case 'lane':
      return laneBytes(requiredHex(spongeStepAt(trace, value.step).lanes[value.lane], value));
    case 'theta':
      return laneBytes(
        requiredHex(spongeStepAt(trace, value.step).theta?.[value.part]?.[value.x], value),
      );
    case 'rc':
      return laneBytes(requiredHex(spongeStepAt(trace, value.step).iota?.rc, value));
  }
}

function requiredHex(hex: string | undefined, value: KeccakValue): string {
  if (hex === undefined) throw new Error(`the trace records no ${describeValue(value)}`);
  return hex;
}

/** The 16 register bytes in memory order: the low half first. */
export function registerBytes(
  trace: Pick<KeccakTrace, 'byStep' | 'valueBytes'>,
  register: KeccakRegister,
): number[] {
  return [...valueBytes(trace, register.low), ...valueBytes(trace, register.high)];
}

/**
 * The symbolic vector registers and stack slots of one listing walk. A register restored from the
 * caller's save area holds a value the trace does not know, so it is forgotten and may not be read.
 */
export class KeccakRegisterFile extends RegisterFile<KeccakRegister> {
  private readonly stack = new Map<number, KeccakRegister>();

  /** The register spilled to stack offset `offset`. */
  readStack(offset: number): KeccakRegister {
    const content = this.stack.get(offset);
    if (content === undefined) throw new Error(`[sp, #${offset}] is reloaded before a spill`);
    return content;
  }

  writeStack(offset: number, content: KeccakRegister): void {
    this.stack.set(offset, content);
  }
}
