import type { RegionSpec } from '@cryventure/core';
import { KECCAK_LANE_BYTES, KECCAK_STATE_BYTES, KECCAK_WIDTH } from '../_lib/keccak/constants.ts';

/**
 * The sha3 state regions (docs/M6.md §2b): the `message` (omitted when empty), the `padded` input
 * (cSHAKE prefix ‖ message ‖ suffix ‖ pad10*1), the state `A` (200 bytes in FIPS 202 byte order,
 * shown as 25 little-endian lanes, five per row y) and the `output` (blank until squeezed).
 */
export type Sha3Region = 'message' | 'padded' | 'A' | 'output';

const NS = 'plugin.sha3';

function region(id: Sha3Region, size: number, extra: Partial<RegionSpec<Sha3Region>> = {}): RegionSpec<Sha3Region> {
  return { id, labelKey: `${NS}.region.${id}`, elem: 'u8', shape: [size], ...extra };
}

/** The regions of one run. */
export function sha3Regions(messageBytes: number, paddedBytes: number, outputBytes: number): RegionSpec<Sha3Region>[] {
  return [
    ...(messageBytes > 0 ? [region('message', messageBytes)] : []),
    region('padded', paddedBytes, { initial: 'blank' }),
    region('A', KECCAK_STATE_BYTES, { layout: { kind: 'words', wordBytes: KECCAK_LANE_BYTES, labelPrefix: 'A', wordsPerGroup: KECCAK_WIDTH, byteOrder: 'little' } }),
    region('output', outputBytes, { initial: 'blank' }),
  ];
}

