import type { ShaListingRole } from '../listing.ts';
import { SHA256_ROUNDS, SHA_VAR_NAMES, type ShaVarName } from './shaTrace.ts';

/**
 * Symbolic lane words, 32-bit (SHA-224/256) or 64-bit (SHA-384/512) (docs/M5.md §5c, docs/M6.md
 * §5c): what a vector lane holds, named by where the trace records its value, so a deriver only
 * **rearranges** (lane moves, byte swaps) and never computes a hash. `shaRegisters.ts` turns these
 * names into bytes read from the trace.
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
  /** h + K_t + W_t, the SHA512H input (wordops round t, term `hKW`; SHA-512 only). */
  | { kind: 'hKW'; t: number }
  /** T1 of round t (wordops round t, term `T1`), what SHA512H returns. */
  | { kind: 'T1'; t: number }
  /** Schedule partial sums for W_t: p1 = W_{t−16} + σ0(W_{t−15}), p2 = p1 + W_{t−7} (wordops schedule t). */
  | { kind: 'p1' | 'p2'; t: number }
  /** H word `name` after this block's feed-forward. */
  | { kind: 'h'; name: ShaVarName }
  /** A literal in memory order, e.g. 4 bytes of the `pshufb` byte-swap mask. */
  | { kind: 'const'; bytes: readonly number[] }
  /**
   * `left + right`, a sum the trace does **not** record (a compiler's reassociated feed-forward, e.g.
   * c + e before T1 joins them): it has no bytes, and only a later sum that the trace records uses it.
   */
  | { kind: 'partial'; left: ShaWord; right: ShaWord };

/** A 128-bit register as lanes, lane 0 (least significant) first: four 32-bit or two 64-bit words. */
export type Lanes = readonly ShaWord[];

/** 32-bit lanes per 128-bit register (SHA-224/256). */
export const LANE_COUNT = 4;

/** Two chains of the round shift: b ← a, c ← b, d ← c and f ← e, g ← f, h ← g. */
const CHAIN_LENGTH = 4;

export const word = {
  var: (name: ShaVarName, round: number): ShaWord => ({ kind: 'var', name, round }),
  w: (t: number): ShaWord => ({ kind: 'w', t }),
  wBytes: (t: number): ShaWord => ({ kind: 'wBytes', t }),
  k: (t: number): ShaWord => ({ kind: 'k', t }),
  kw: (t: number): ShaWord => ({ kind: 'kw', t }),
  hKW: (t: number): ShaWord => ({ kind: 'hKW', t }),
  T1: (t: number): ShaWord => ({ kind: 'T1', t }),
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
    case 'partial':
      return (
        right.kind === 'partial' &&
        sameWord(left.left, right.left) &&
        sameWord(left.right, right.right)
      );
    default:
      return right.kind === left.kind && 't' in right && right.t === left.t;
  }
}

/** Working variables `names` (lane 0 first) after round `round`, e.g. ABEF = ['f', 'e', 'b', 'a']. */
export function varLanes(names: readonly ShaVarName[], round: number): Lanes {
  return names.map((name) => word.var(name, round));
}

/** `make(first)`, `make(first + 1)`, … for the `count` lanes (default four). */
export function laneRun(
  make: (index: number) => ShaWord,
  first: number,
  count: number = LANE_COUNT,
): Lanes {
  return Array.from({ length: count }, (_, lane) => make(first + lane));
}

/** Lane `index` of `lanes`; throws when there is none. */
export function laneAt(lanes: Lanes, index: number): ShaWord {
  const lane = lanes[index];
  if (lane === undefined) throw new Error(`no lane ${index}`);
  return lane;
}

/** H words `first` … `first + count − 1` (a … h by index) after the block's feed-forward. */
export function hLanes(first: number, count: number = LANE_COUNT): Lanes {
  return laneRun((index) => word.h(SHA_VAR_NAMES[index]!), first, count);
}

/** The error for a load whose listing role is neither `loadState` nor `loadBlock`. */
export function noLoadSemantics(role: ShaListingRole): Error {
  return new Error(`no load semantics for role ${role}`);
}

/**
 * What a 16-byte load of words `first` … (`count` of them) brings in: the block input H^(n−1) as
 * a … h at round −1 (`loadState`) or the block's bytes, not yet swapped (`loadBlock`); throws for any
 * other role.
 */
export function blockInputLanes(
  role: ShaListingRole,
  first: number,
  count: number = LANE_COUNT,
): Lanes {
  switch (role) {
    case 'loadState':
      return laneRun((index) => word.var(SHA_VAR_NAMES[index]!, -1), first, count);
    case 'loadBlock':
      return laneRun(word.wBytes, first, count);
    default:
      throw noLoadSemantics(role);
  }
}

/** The feed-forward rule: x at the block input plus x after the last round (`rounds` − 1) is H's word x. */
function feedForwardSum(left: ShaWord, right: ShaWord, rounds: number): ShaWord | undefined {
  if (left.kind !== 'var' || left.round !== -1) return undefined;
  return sameWord(right, word.var(left.name, rounds - 1)) ? word.h(left.name) : undefined;
}

/** Whether `lane` is working variable `name` after round `round` (through the round shift). */
const isVar = (lane: ShaWord, name: ShaVarName, round: number): boolean =>
  lane.kind === 'var' && sameWord(lane, word.var(name, round));

/**
 * The SHA-2 round sums the trace records (FIPS 180-4 §6.2.2, §6.4.2): K_t + W_t, p1 + W_{t−7} = p2
 * (docs/M5.md §2d), h + (K_t + W_t) = hKW_t and d + T1_t = e after round t (docs/M6.md §2f).
 */
function roundSum(left: ShaWord, right: ShaWord): ShaWord | undefined {
  if (left.kind === 'k' && right.kind === 'w' && left.t === right.t) return word.kw(left.t);
  if (left.kind === 'p1' && right.kind === 'w' && left.t - 7 === right.t) return word.p2(left.t);
  if (left.kind === 'kw' && isVar(right, 'h', left.t - 1)) return word.hKW(left.t);
  if (left.kind === 'T1' && isVar(right, 'd', left.t - 1)) return word.var('e', left.t);
  return undefined;
}

/** (x + y) + z as x + (y + z): a recorded sum when y + z and then x + (y + z) are recorded. */
function reassociated(x: ShaWord, y: ShaWord, z: ShaWord, rounds: number): ShaWord | undefined {
  const inner = laneSum(y, z, rounds);
  return inner === undefined ? undefined : laneSum(x, inner, rounds);
}

/** A sum the trace records, `undefined` otherwise; a partial sum joins `right` through either of its parts. */
function traceSum(left: ShaWord, right: ShaWord, rounds: number): ShaWord | undefined {
  if (left.kind === 'partial')
    return (
      reassociated(left.left, left.right, right, rounds) ??
      reassociated(left.right, left.left, right, rounds)
    );
  return roundSum(left, right) ?? feedForwardSum(left, right, rounds);
}

/**
 * The lane word `left + right` (mod 2^32 or 2^64) names, in either order; `undefined` if the trace has
 * no such value. `rounds` (64 or 80) places the feed-forward.
 */
export function laneSum(
  left: ShaWord,
  right: ShaWord,
  rounds: number = SHA256_ROUNDS,
): ShaWord | undefined {
  return traceSum(left, right, rounds) ?? traceSum(right, left, rounds);
}

/** Lane-wise `left + right` (`paddd`, `add .4s`, `add .2d`); throws for a lane whose sum the trace does not record. */
export function sumLanes(left: Lanes, right: Lanes, rounds: number = SHA256_ROUNDS): Lanes {
  return left.map((lane, index) => {
    const sum = laneSum(lane, laneAt(right, index), rounds);
    if (sum === undefined) throw new Error(`no traced value for the sum in lane ${index}`);
    return sum;
  });
}

/**
 * Lane-wise `left + right` where a sum the trace does not record stays a `partial` word (a
 * reassociated feed-forward; docs/M6.md §5c): only its later, recorded sum gets bytes.
 */
export function partialSumLanes(left: Lanes, right: Lanes, rounds: number): Lanes {
  return left.map((lane, index) => {
    const other = laneAt(right, index);
    return laneSum(lane, other, rounds) ?? { kind: 'partial', left: lane, right: other };
  });
}

/** Whether the trace records every lane's value (no `partial` sum), so the register has bytes. */
export function isTraced(lanes: Lanes): boolean {
  return lanes.every((lane) => lane.kind !== 'partial');
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
    case 'hKW':
      return `h+K+W${lane.t}`;
    case 'T1':
      return `T1(${lane.t})`;
    case 'p1':
    case 'p2':
      return `${lane.kind}(W${lane.t})`;
    case 'h':
      return `H.${lane.name}`;
    case 'const':
      return `const(${lane.bytes.join(',')})`;
    case 'partial':
      return `(${describeWord(lane.left)}+${describeWord(lane.right)})`;
  }
}

export function describeLanes(lanes: readonly (ShaWord | undefined)[]): string {
  return `[${lanes.map((lane) => (lane === undefined ? '*' : describeWord(lane))).join(', ')}]`;
}
