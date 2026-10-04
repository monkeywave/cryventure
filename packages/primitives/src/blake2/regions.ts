import type { RegionLayout, RegionSpec } from '@cryventure/core';
import { u8Region } from '../_lib/sha2/regions.ts';

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

export function blake2Regions(ns: string, { messageBytes, keyBytes, wordBytes, outputBytes }: Blake2RegionSizes): RegionSpec<Blake2Region>[] {
  return [
    ...(messageBytes > 0 ? [u8Region(ns, 'message', messageBytes, undefined, false)] : []),
    ...(keyBytes > 0 ? [u8Region(ns, 'key', keyBytes, undefined, false)] : []),
    u8Region(ns, 'm', 16 * wordBytes, littleEndianWords(wordBytes, 'm')),
    u8Region(ns, 'h', 8 * wordBytes, littleEndianWords(wordBytes, 'h')),
    u8Region(ns, 'v', 16 * wordBytes, littleEndianWords(wordBytes, 'v')),
    u8Region(ns, 'digest', outputBytes),
  ];
}

