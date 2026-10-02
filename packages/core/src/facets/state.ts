import type { I18nRef } from '../i18n.ts';

export type ElemType = 'u8' | 'u16' | 'u32' | 'u64' | 'i16';

export interface RegionSpec<R extends string> {
  id: R;
  labelKey: string;
  elem: ElemType;
  shape: number[];
  order?: 'row-major' | 'col-major';
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
  steps: StateStep<R, Op>[];
  keyframes: Keyframe<R>[];
  truncated?: boolean;
  /**
   * Optional label per scope level (outermost first), e.g. AES: [round, operation].
   * Label templates receive `{{n}}` (1-based level index) and `{{value}}`.
   */
  scopeLevels?: { labelKey: string }[];
}

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
