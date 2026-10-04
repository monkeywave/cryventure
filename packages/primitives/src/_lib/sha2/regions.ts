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

function words(wordBytes: number, labelPrefix?: string): RegionLayout {
  return { kind: 'words', wordBytes, ...(labelPrefix === undefined ? {} : { labelPrefix }), wordsPerGroup: WORDS_PER_GROUP };
}

function region(ns: string, id: Sha2Region, size: number, layout?: RegionLayout): RegionSpec<Sha2Region> {
  return { id, labelKey: `${ns}.region.${id}`, elem: 'u8', shape: [size], ...(layout === undefined ? {} : { layout }), ...(id === 'message' ? {} : { initial: 'blank' as const }) };
}

/** The regions for one run; the digest uses whole words where they divide it (SHA-512/224: 4-byte words). */
export function sha2Regions<W extends Word>(ns: string, algorithm: Sha2Algorithm<W>, messageBytes: number, paddedBytes: number): RegionSpec<Sha2Region>[] {
  const { arith, rounds } = algorithm.params;
  const wordBytes = arith.bytes;
  const digestWordBytes = algorithm.outputSize % wordBytes === 0 ? wordBytes : 4;
  return [
    ...(messageBytes > 0 ? [region(ns, 'message', messageBytes)] : []),
    region(ns, 'padded', paddedBytes, words(wordBytes)),
    region(ns, 'w', rounds * wordBytes, words(wordBytes, 'W')),
    region(ns, 'vars', SHA2_REGISTER_NAMES.length * wordBytes, words(wordBytes)),
    region(ns, 'h', SHA2_REGISTER_NAMES.length * wordBytes, words(wordBytes, 'H')),
    region(ns, 'digest', algorithm.outputSize, words(digestWordBytes)),
  ];
}

/** The initial snapshot: the message; every other region blank. */
export function sha2InitialSnapshot(regions: readonly RegionSpec<Sha2Region>[], message: readonly number[]): Snapshot<Sha2Region> {
  const initial: Record<string, readonly number[]> = { ...zeroSnapshot(regions) };
  if (message.length > 0) initial['message'] = [...message];
  return initial as unknown as Snapshot<Sha2Region>;
}

/** Byte indices of words `first` … `first + count − 1` in a words region. */
export function wordIndices(wordBytes: number, first: number, count = 1): number[] {
  return allIndices(count * wordBytes).map((index) => first * wordBytes + index);
}
