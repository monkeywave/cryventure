import type { RegionSpec } from '@cryventure/core';
import { byteRegion, spongeRegions } from '../_lib/keccak/spongeRecording.ts';
import type { SpongeRegion } from '../_lib/keccak/spongeSteps.ts';

/**
 * The kmac state regions (docs/M7.md §2c): the `key` K and the `message` X (each omitted when empty),
 * the `encodedKey` bytepad(encode_string(K), r) and the `encodedLength` right_encode(L) (blank until
 * computed), then the sponge regions `padded`, `A` and `output`.
 */
export type KmacRegion = 'key' | 'message' | 'encodedKey' | 'encodedLength' | SpongeRegion;

const NS = 'plugin.kmac';

/** Byte sizes of the input regions of one run. */
export interface KmacRegionSizes {
  key: number;
  message: number;
  encodedKey: number;
  encodedLength: number;
  padded: number;
  output: number;
}

function region(id: KmacRegion, size: number, extra: Partial<RegionSpec<KmacRegion>> = {}): RegionSpec<KmacRegion> {
  return byteRegion(NS, id, size, extra);
}

/** The regions of one run. */
export function kmacRegions(sizes: KmacRegionSizes): RegionSpec<KmacRegion>[] {
  return [
    ...(sizes.key > 0 ? [region('key', sizes.key)] : []),
    ...(sizes.message > 0 ? [region('message', sizes.message)] : []),
    region('encodedKey', sizes.encodedKey, { initial: 'blank' }),
    region('encodedLength', sizes.encodedLength, { initial: 'blank' }),
    ...spongeRegions(NS, sizes.padded, sizes.output),
  ];
}
