/** The affine map, S-box entry and S-box tables live in core (shared GF(2^8) math); re-exported for AES callers. */
export { AFFINE_CONSTANT, affine, buildInvSbox, buildSbox, INV_SBOX, SBOX, sboxEntry } from '@cryventure/core';

/** Table lookup with a defined fallback so callers stay `number` under noUncheckedIndexedAccess. */
export function lookup(table: readonly number[], byte: number): number {
  return table[byte & 0xff] ?? 0;
}
