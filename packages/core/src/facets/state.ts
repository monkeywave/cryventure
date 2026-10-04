import type { I18nRef } from '../i18n.ts';

export type ElemType = 'u8' | 'u16' | 'u32' | 'u64' | 'i16';

const ELEM_BYTES: Readonly<Record<ElemType, number>> = { u8: 1, u16: 2, i16: 2, u32: 4, u64: 8 };
const ELEM_MAX: Readonly<Record<ElemType, number>> = { u8: 0xff, u16: 0xffff, i16: 0x7fff, u32: 0xffffffff, u64: Number.MAX_SAFE_INTEGER };

/** Storage size of one element in bytes (u8 1, u16/i16 2, u32 4, u64 8). */
export function elemBytes(elem: ElemType): number {
  return ELEM_BYTES[elem];
}

/** Width of one element in bits (`8 × elemBytes`). */
export function elemBits(elem: ElemType): number {
  return ELEM_BYTES[elem] * 8;
}

/** Largest value an element can hold (u64 is capped at `Number.MAX_SAFE_INTEGER`; i16 is signed). */
export function elemMax(elem: ElemType): number {
  return ELEM_MAX[elem];
}

/**
 * Producer-declared presentation hint for a region (views must not guess from `shape`):
 * - `grid`: one cell per element, laid out by `shape`/`order` (the default without a hint).
 * - `words`: a list of `wordBytes`-byte words (e.g. AES key schedule `w0 … w43`), optionally named
 *   `<labelPrefix><index>` (a symbol, not translated) and grouped `wordsPerGroup` per row
 *   (e.g. 4 words per AES round key). `wordBytes` must divide the region's byte size. `byteOrder`
 *   (default `big`) says how a word's bytes form its integer value: `little` for Keccak lanes,
 *   BLAKE2 and MD5 words (docs/M6.md §3c); the state view then shows the integer value.
 */
export type RegionLayout = { kind: 'grid' } | { kind: 'words'; wordBytes: number; labelPrefix?: string; wordsPerGroup?: number; byteOrder?: WordByteOrder };

/** How a `words` layout's bytes form each word's integer value. */
export type WordByteOrder = 'big' | 'little';

export interface RegionSpec<R extends string> {
  id: R;
  labelKey: string;
  elem: ElemType;
  shape: number[];
  order?: 'row-major' | 'col-major';
  /** Optional presentation hint (additive, schemaVersion stays 1); see `RegionLayout`. */
  layout?: RegionLayout;
  /**
   * `'blank'`: the initial snapshot only holds placeholders (e.g. zeros) for this region, not real
   * values, so views show its elements as "not yet written" until a step writes them (see
   * `unwrittenAt`). Without it (the default, e.g. AES state) the initial values are meaningful.
   * Additive, schemaVersion stays 1.
   */
  initial?: 'blank';
}

/**
 * Label keys of one scope level (outermost first). `labelKey` is the template for the level's
 * current value; `nextKey`/`prevKey` are optional full button labels for stepping by this level
 * (e.g. "Next round" / "Nächste Runde"), so no generic template has to agree with the noun's gender.
 * Without them the player uses its own generic labels.
 */
export interface ScopeLevel {
  labelKey: string;
  nextKey?: string;
  prevKey?: string;
}

export interface Write<R extends string> {
  region: R;
  offset: number;
  values: number[];
}

export type HighlightKind = 'read' | 'write' | 'xor' | 'sbox' | 'move' | 'carry' | 'constant';

export interface Highlight<R extends string> {
  region: R;
  indices: number[];
  kind: HighlightKind;
}

export type StateStep<R extends string, Op extends { op: string }> = Op & {
  scope: number[];
  writes: Write<R>[];
  highlights: Highlight<R>[];
  narration: I18nRef;
  src?: { listing: string; line: number };
};

/** Plain number arrays so snapshots stay JSON-serializable. */
export type Snapshot<R extends string> = Readonly<Record<R, readonly number[]>>;

export interface Keyframe<R extends string> {
  step: number;
  snapshot: Snapshot<R>;
}

export interface StateFacet<R extends string, Op extends { op: string }> {
  kind: 'state';
  schemaVersion: 1;
  regions: RegionSpec<R>[];
  initial: Snapshot<R>;
  /**
   * Optional narration of `initial` (step −1, before step 0), e.g. "a = {57} and b = {83} are
   * loaded". `narrationFromState` emits it as the narration entry at step −1; without it the player
   * shows its generic initial-state hint. Additive, schemaVersion stays 1 (docs/M3.md §0a).
   */
  initialNarration?: I18nRef;
  steps: StateStep<R, Op>[];
  keyframes: Keyframe<R>[];
  truncated?: boolean;
  /**
   * Optional label per scope level (outermost first), e.g. AES: [round, operation].
   * Label templates receive `{{value}}` (the raw scope index at that level, e.g. round 0 → 0),
   * `{{ordinal}}` (value + 1, for 1-based counting such as "Operation 1") and `{{n}}` (1-based level index).
   * The player shows the current step's op label (the manifest's `ops[op]`) instead of the deepest
   * level's template when the producer declares one, e.g. "Round 1 · SubBytes". See `ScopeLevel` for the optional next/prev labels.
   */
  scopeLevels?: ScopeLevel[];
}

/** A state facet of any producer (region ids and op shapes erased). */
export type AnyStateFacet = StateFacet<string, { op: string }>;

/** Number of elements a region holds (product of its shape). */
export function regionSize(spec: Pick<RegionSpec<string>, 'shape'>): number {
  return spec.shape.reduce((size, dim) => size * dim, 1);
}

function writtenRegion<R extends string>(snapshot: Snapshot<R>, write: Write<R>): readonly number[] {
  const current: readonly number[] | undefined = snapshot[write.region];
  if (current === undefined) throw new RangeError(`applyWrites: unknown region "${write.region}"`);
  if (write.offset < 0 || write.offset + write.values.length > current.length) {
    throw new RangeError(
      `applyWrites: write to "${write.region}" at ${write.offset}+${write.values.length} exceeds length ${current.length}`,
    );
  }
  return current;
}

/**
 * Pure copy-on-write update: only regions that are written get a fresh array;
 * every other region keeps the same array reference as the input snapshot.
 */
export function applyWrites<R extends string>(snapshot: Snapshot<R>, writes: readonly Write<NoInfer<R>>[]): Snapshot<R> {
  if (writes.length === 0) return snapshot;
  const next: Record<R, readonly number[]> = { ...snapshot };
  const copied = new Map<R, number[]>();
  for (const write of writes) {
    const source = writtenRegion(next, write);
    const target = copied.get(write.region) ?? [...source];
    target.splice(write.offset, write.values.length, ...write.values);
    copied.set(write.region, target);
    next[write.region] = target;
  }
  return next;
}
