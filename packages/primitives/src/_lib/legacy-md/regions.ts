import type { RegionLayout, RegionSpec, WordByteOrder } from '@cryventure/core';
import { u8Region, wordsLayout } from '../sha2/regions.ts';
import type { LegacyAlgorithm } from './algorithm.ts';

/**
 * The MD5/SHA-1 state regions (docs/M6.md §2e), as SHA-2's: `message` (omitted when empty),
 * `padded`, the schedule `w` (SHA-1 only), the registers `vars`, the chaining value `h` and the
 * `digest`. All `u8`; MD5's words are little-endian (`byteOrder: 'little'`, §3c).
 */
export type LegacyRegion = 'message' | 'padded' | 'w' | 'vars' | 'h' | 'digest';

export const LEGACY_WORD_BYTES = 4;
export const LEGACY_BLOCK_BYTES = 64;

/** A 4-byte `words` layout in `order` (big-endian is the default and stays implicit). */
export function legacyWordsLayout(order: WordByteOrder, labelPrefix?: string): RegionLayout {
  const layout = wordsLayout(LEGACY_WORD_BYTES, labelPrefix);
  return order === 'little' && layout.kind === 'words' ? { ...layout, byteOrder: 'little' } : layout;
}

const region = (ns: string, id: LegacyRegion, size: number, layout?: RegionLayout): RegionSpec<LegacyRegion> => u8Region(ns, id, size, layout, id !== 'message');

/** The regions for one run over `messageBytes` bytes padded to `paddedBytes`. */
export function legacyRegions(ns: string, algorithm: LegacyAlgorithm, messageBytes: number, paddedBytes: number): RegionSpec<LegacyRegion>[] {
  const words = (prefix?: string) => legacyWordsLayout(algorithm.byteOrder, prefix);
  const registerBytes = algorithm.registerNames.length * LEGACY_WORD_BYTES;
  return [
    ...(messageBytes > 0 ? [region(ns, 'message', messageBytes)] : []),
    region(ns, 'padded', paddedBytes, words()),
    ...(algorithm.hasSchedule ? [region(ns, 'w', algorithm.rounds * LEGACY_WORD_BYTES, words('W'))] : []),
    region(ns, 'vars', registerBytes, words()),
    region(ns, 'h', registerBytes, words('H')),
    region(ns, 'digest', algorithm.outputSize, words()),
  ];
}
