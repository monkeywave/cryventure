import { sboxEntry } from '@cryventure/core';

/** The affine map and S-box entry now live in core (shared GF(2^8) math); re-exported for AES callers. */
export { AFFINE_CONSTANT, affine, sboxEntry } from '@cryventure/core';

export function buildSbox(): number[] {
  return Array.from({ length: 256 }, (_, x) => sboxEntry(x));
}

/** Inverts a byte permutation table (defaults to the AES S-box). */
export function buildInvSbox(sbox: readonly number[] = SBOX): number[] {
  const inverse = new Array<number>(256).fill(0);
  sbox.forEach((output, input) => {
    inverse[output] = input;
  });
  return inverse;
}

export const SBOX: readonly number[] = buildSbox();
export const INV_SBOX: readonly number[] = buildInvSbox(SBOX);

/** Table lookup with a defined fallback so callers stay `number` under noUncheckedIndexedAccess. */
export function lookup(table: readonly number[], byte: number): number {
  return table[byte & 0xff] ?? 0;
}
