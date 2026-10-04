import type { ShaListingRole } from '../listing.ts';
import { SHA256_ROUNDS, SHA_VAR_NAMES, type ShaVarName } from './shaTrace.ts';

/**
 * Symbolic 32-bit lane words (docs/M5.md §5c): what a vector lane holds, named by where the trace
 * records its value, so a deriver only **rearranges** (lane moves, byte swaps) and never computes a
 * hash. `shaRegisters.ts` turns these names into bytes read from the trace.
 */
export type ShaWord =
  /** Working variable `name` after round `round` of the block (−1: at the block's `init`, = H^(n−1)). */
  | { kind: 'var'; name: ShaVarName; round: number }
  /** Schedule word W_t as a number (lane value W_t). */
  | { kind: 'w'; t: number }
  /** W_t's big-endian bytes loaded unchanged from the block (lane value = W_t byte-swapped). */
  | { kind: 'wBytes'; t: number }
  /** The round constant K_t. */
  | { kind: 'k'; t: number }
  /** K_t + W_t (wordops round t, term `kw`). */
  | { kind: 'kw'; t: number }
  /** Schedule partial sums for W_t: p1 = W_{t−16} + σ0(W_{t−15}), p2 = p1 + W_{t−7} (wordops schedule t). */
  | { kind: 'p1' | 'p2'; t: number }
  /** H word `name` after this block's feed-forward. */
  | { kind: 'h'; name: ShaVarName }
  /** A literal in memory order, e.g. 4 bytes of the `pshufb` byte-swap mask. */
  | { kind: 'const'; bytes: readonly number[] };

/** A 128-bit register as four 32-bit lanes, lane 0 (least significant) first. */
export type Lanes = readonly ShaWord[];

export const LANE_COUNT = 4;

/** Two chains of the round shift: b ← a, c ← b, d ← c and f ← e, g ← f, h ← g. */
const CHAIN_LENGTH = 4;

export const word = {
  var: (name: ShaVarName, round: number): ShaWord => ({ kind: 'var', name, round }),
  w: (t: number): ShaWord => ({ kind: 'w', t }),
  wBytes: (t: number): ShaWord => ({ kind: 'wBytes', t }),
  k: (t: number): ShaWord => ({ kind: 'k', t }),
  kw: (t: number): ShaWord => ({ kind: 'kw', t }),
  p1: (t: number): ShaWord => ({ kind: 'p1', t }),
  p2: (t: number): ShaWord => ({ kind: 'p2', t }),
  h: (name: ShaVarName): ShaWord => ({ kind: 'h', name }),
};

/**
 * The earliest name of a working variable's value: b after round r is a after round r − 1, …, d after
 * r is a after r − 3 (likewise f, g, h from e), as long as that round exists (≥ −1, the block input).
 */
function canonicalVar(name: ShaVarName, round: number): { name: ShaVarName; round: number } {
  const index = SHA_VAR_NAMES.indexOf(name);
  const position = index % CHAIN_LENGTH;
  const back = Math.max(0, Math.min(position, round + 1));
  return { name: SHA_VAR_NAMES[index - back]!, round: round - back };
}

/** Whether two lane words hold the same trace value (working variables compared through the shift). */
export function sameWord(left: ShaWord, right: ShaWord): boolean {
  switch (left.kind) {
    case 'var': {
      if (right.kind !== 'var') return false;
      const a = canonicalVar(left.name, left.round);
      const b = canonicalVar(right.name, right.round);
      return a.name === b.name && a.round === b.round;
    }
    case 'h':
      return right.kind === 'h' && left.name === right.name;
    case 'const':
      return (
        right.kind === 'const' &&
        left.bytes.length === right.bytes.length &&
        left.bytes.every((byte, index) => byte === right.bytes[index])
      );
    default:
      return right.kind === left.kind && 't' in right && right.t === left.t;
  }
}

/** Working variables `names` (lane 0 first) after round `round`, e.g. ABEF = ['f', 'e', 'b', 'a']. */
export function varLanes(names: readonly ShaVarName[], round: number): Lanes {
  return names.map((name) => word.var(name, round));
}

/** `make(first)`, `make(first + 1)`, … for the four lanes. */
export function laneRun(make: (index: number) => ShaWord, first: number): Lanes {
  return Array.from({ length: LANE_COUNT }, (_, lane) => make(first + lane));
}

/** Lane `index` of `lanes`; throws when there is none. */
export function laneAt(lanes: Lanes, index: number): ShaWord {
  const lane = lanes[index];
  if (lane === undefined) throw new Error(`no lane ${index}`);
  return lane;
}

/** H words `first` … `first + 3` (a … h by index) after the block's feed-forward. */
export function hLanes(first: number): Lanes {
  return laneRun((index) => word.h(SHA_VAR_NAMES[index]!), first);
}

/**
 * What a 16-byte load of words `first` … brings in: the block input H^(n−1) as a … h at round −1
 * (`loadState`) or the block's bytes, not yet swapped (`loadBlock`); throws for any other role.
 */
export function blockInputLanes(role: ShaListingRole, first: number): Lanes {
  switch (role) {
    case 'loadState':
      return laneRun((index) => word.var(SHA_VAR_NAMES[index]!, -1), first);
    case 'loadBlock':
      return laneRun(word.wBytes, first);
    default:
      throw new Error(`no load semantics for role ${role}`);
  }
}

/** The feed-forward rule: x at the block input plus x after the last round is H's word x. */
function feedForwardSum(left: ShaWord, right: ShaWord): ShaWord | undefined {
  if (left.kind !== 'var' || left.round !== -1) return undefined;
  return sameWord(right, word.var(left.name, SHA256_ROUNDS - 1)) ? word.h(left.name) : undefined;
}

/** K_t + W_t and p1 + W_{t−7} = p2 (docs/M5.md §2d); `undefined` when the trace records no such sum. */
function traceSum(left: ShaWord, right: ShaWord): ShaWord | undefined {
  if (left.kind === 'k' && right.kind === 'w' && left.t === right.t) return word.kw(left.t);
  if (left.kind === 'p1' && right.kind === 'w' && left.t - 7 === right.t) return word.p2(left.t);
  return feedForwardSum(left, right);
}

/** The lane word `left + right` (mod 2^32) names, in either order; `undefined` if the trace has no such value. */
export function laneSum(left: ShaWord, right: ShaWord): ShaWord | undefined {
  return traceSum(left, right) ?? traceSum(right, left);
}

/** Lane-wise `left + right` (`paddd`, `add .4s`); throws for a lane whose sum the trace does not record. */
export function sumLanes(left: Lanes, right: Lanes): Lanes {
  return left.map((lane, index) => {
    const sum = laneSum(lane, laneAt(right, index));
    if (sum === undefined) throw new Error(`no traced value for the sum in lane ${index}`);
    return sum;
  });
}

/** W_t ↔ its big-endian bytes: what a per-word byte swap (`pshufb`, `rev32`) does to a lane; `undefined` otherwise. */
export function byteSwapped(lane: ShaWord): ShaWord | undefined {
  if (lane.kind === 'w') return word.wBytes(lane.t);
  if (lane.kind === 'wBytes') return word.w(lane.t);
  return undefined;
}

/** Every lane of register `register` byte-swapped (`pshufb` with the swap mask, `rev32`); throws for a lane without a traced swap. */
export function byteSwapLanes(lanes: Lanes, register: string): Lanes {
  return lanes.map((lane) => {
    const swapped = byteSwapped(lane);
    if (swapped === undefined)
      throw new Error(`no traced value for a byte-swapped lane of ${register}`);
    return swapped;
  });
}

/** A short text for error messages, e.g. `a@3`, `W17`, `K+W5`. */
export function describeWord(lane: ShaWord): string {
  switch (lane.kind) {
    case 'var':
      return `${lane.name}@${lane.round}`;
    case 'w':
      return `W${lane.t}`;
    case 'wBytes':
      return `bytes(W${lane.t})`;
    case 'k':
      return `K${lane.t}`;
    case 'kw':
      return `K+W${lane.t}`;
    case 'p1':
    case 'p2':
      return `${lane.kind}(W${lane.t})`;
    case 'h':
      return `H.${lane.name}`;
    case 'const':
      return `const(${lane.bytes.join(',')})`;
  }
}

export function describeLanes(lanes: readonly (ShaWord | undefined)[]): string {
  return `[${lanes.map((lane) => (lane === undefined ? '*' : describeWord(lane))).join(', ')}]`;
}
