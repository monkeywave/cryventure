import type { RegionSpec } from '@cryventure/core';
import { spongeRegions } from '../_lib/keccak/spongeRecording.ts';
import type { SpongeRegion } from '../_lib/keccak/spongeSteps.ts';

/**
 * The sha3 state regions (docs/M6.md §2b): the `message` (omitted when empty), then the sponge
 * regions: the `padded` input (cSHAKE prefix ‖ message ‖ suffix ‖ pad10*1), the state `A` (200 bytes
 * in FIPS 202 byte order, shown as 25 little-endian lanes, five per row y) and the `output` (blank
 * until squeezed).
 */
export type Sha3Region = 'message' | SpongeRegion;

const NS = 'plugin.sha3';

/** The regions of one run. */
export function sha3Regions(messageBytes: number, paddedBytes: number, outputBytes: number): RegionSpec<Sha3Region>[] {
  const message: RegionSpec<Sha3Region> = { id: 'message', labelKey: `${NS}.region.message`, elem: 'u8', shape: [messageBytes] };
  return [...(messageBytes > 0 ? [message] : []), ...spongeRegions(NS, paddedBytes, outputBytes)];
}
