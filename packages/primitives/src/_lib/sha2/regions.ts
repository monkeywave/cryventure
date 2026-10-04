import { allIndices, zeroSnapshot, type RegionLayout, type RegionSpec, type Snapshot } from '@cryventure/core';
import type { Sha2Algorithm } from './algorithms.ts';
import type { Word } from './words.ts';

/**
 * The SHA-2 state regions (docs/M5.md §2d): all `u8`, words big-endian as FIPS writes them.
 * `message` (omitted when empty, like GCM's empty input), `padded`, the schedule `w`, the working
 * variables `vars` (a … h), the chaining value `h` and the `digest`.
 */
export type Sha2Region = 'message' | 'padded' | 'w' | 'vars' | 'h' | 'digest';

/** The working-variable names, in register order. */
export const SHA2_REGISTER_NAMES: readonly string[] = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
const WORDS_PER_GROUP = 4;

/** A `words` layout: big-endian words of `wordBytes` bytes, `wordsPerGroup` to a group. */
export function wordsLayout(wordBytes: number, labelPrefix?: string, wordsPerGroup = WORDS_PER_GROUP): RegionLayout {
  return { kind: 'words', wordBytes, ...(labelPrefix === undefined ? {} : { labelPrefix }), wordsPerGroup };
}

/**
 * A flat `u8` region of `size` bytes labelled `<ns>.region.<id>`, with an optional layout; blank
 * (placeholder zeros until a step writes it) unless `blank` is false. Shared with `sha2-constants`.
 */
export function u8Region<R extends string>(ns: string, id: R, size: number, layout?: RegionLayout, blank = true): RegionSpec<R> {
  return { id, labelKey: `${ns}.region.${id}`, elem: 'u8', shape: [size], ...(layout === undefined ? {} : { layout }), ...(blank ? { initial: 'blank' as const } : {}) };
}

const region = (ns: string, id: Sha2Region, size: number, layout?: RegionLayout): RegionSpec<Sha2Region> => u8Region(ns, id, size, layout, id !== 'message');

/** The regions for one run; the digest uses whole words where they divide it (SHA-512/224: 4-byte words). */
export function sha2Regions<W extends Word>(ns: string, algorithm: Sha2Algorithm<W>, messageBytes: number, paddedBytes: number): RegionSpec<Sha2Region>[] {
  const { arith, rounds } = algorithm.params;
  const wordBytes = arith.bytes;
  const digestWordBytes = algorithm.outputSize % wordBytes === 0 ? wordBytes : 4;
  return [
    ...(messageBytes > 0 ? [region(ns, 'message', messageBytes)] : []),
    region(ns, 'padded', paddedBytes, wordsLayout(wordBytes)),
    region(ns, 'w', rounds * wordBytes, wordsLayout(wordBytes, 'W')),
    region(ns, 'vars', SHA2_REGISTER_NAMES.length * wordBytes, wordsLayout(wordBytes)),
    region(ns, 'h', SHA2_REGISTER_NAMES.length * wordBytes, wordsLayout(wordBytes, 'H')),
    region(ns, 'digest', algorithm.outputSize, wordsLayout(digestWordBytes)),
  ];
}

/** The initial snapshot: every non-empty seed (the message, a key, …) in its region, the other regions zero/blank. */
export function initialSnapshot<R extends string>(regions: readonly RegionSpec<R>[], seeds: Partial<Record<R, readonly number[]>>): Snapshot<R> {
  const initial: Record<string, readonly number[]> = { ...zeroSnapshot(regions) };
  for (const [id, values] of Object.entries<readonly number[] | undefined>(seeds)) if (values !== undefined && values.length > 0) initial[id] = [...values];
  return initial as unknown as Snapshot<R>;
}

/** Byte indices of words `first` … `first + count − 1` in a words region. */
export function wordIndices(wordBytes: number, first: number, count = 1): number[] {
  return allIndices(count * wordBytes).map((index) => first * wordBytes + index);
}
