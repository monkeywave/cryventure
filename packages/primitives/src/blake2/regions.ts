import { allIndices, zeroSnapshot, type RegionLayout, type RegionSpec, type Snapshot } from '@cryventure/core';

/**
 * The BLAKE2 state regions (docs/M6.md §2d), all `u8`: `message` (omitted when empty), `key` (when
 * keyed), the current block `m` (16 words), the chaining value `h` (8 words), the working vector `v`
 * (16 words, four per row: the 4 × 4 matrix) and the `digest`. Words are little-endian (RFC 7693 §2.4).
 */
export type Blake2Region = 'message' | 'key' | 'm' | 'h' | 'v' | 'digest';

export interface Blake2RegionSizes {
  messageBytes: number;
  keyBytes: number;
  wordBytes: 4 | 8;
  outputBytes: number;
}

const WORDS_PER_ROW = 4;

function littleEndianWords(wordBytes: number, labelPrefix: string): RegionLayout {
  return { kind: 'words', wordBytes, labelPrefix, wordsPerGroup: WORDS_PER_ROW, byteOrder: 'little' };
}

function region(ns: string, id: Blake2Region, size: number, blank: boolean, layout?: RegionLayout): RegionSpec<Blake2Region> {
  return { id, labelKey: `${ns}.region.${id}`, elem: 'u8', shape: [size], ...(layout === undefined ? {} : { layout }), ...(blank ? { initial: 'blank' as const } : {}) };
}

export function blake2Regions(ns: string, { messageBytes, keyBytes, wordBytes, outputBytes }: Blake2RegionSizes): RegionSpec<Blake2Region>[] {
  return [
    ...(messageBytes > 0 ? [region(ns, 'message', messageBytes, false)] : []),
    ...(keyBytes > 0 ? [region(ns, 'key', keyBytes, false)] : []),
    region(ns, 'm', 16 * wordBytes, true, littleEndianWords(wordBytes, 'm')),
    region(ns, 'h', 8 * wordBytes, true, littleEndianWords(wordBytes, 'h')),
    region(ns, 'v', 16 * wordBytes, true, littleEndianWords(wordBytes, 'v')),
    region(ns, 'digest', outputBytes, true),
  ];
}

/** The initial snapshot: the message and the key; every other region blank. */
export function blake2InitialSnapshot(regions: readonly RegionSpec<Blake2Region>[], message: readonly number[], key: readonly number[]): Snapshot<Blake2Region> {
  const initial: Record<string, readonly number[]> = { ...zeroSnapshot(regions) };
  if (message.length > 0) initial['message'] = [...message];
  if (key.length > 0) initial['key'] = [...key];
  return initial as unknown as Snapshot<Blake2Region>;
}

/** Byte indices of words `first` … `first + count − 1` in a words region. */
export function wordIndices(wordBytes: number, first: number, count = 1): number[] {
  return allIndices(count * wordBytes).map((index) => first * wordBytes + index);
}
