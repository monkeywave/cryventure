import { sboxEntry } from './rijndaelAffine.ts';

/** The AES S-box as lookup tables, derived entry by entry from `sboxEntry` (not memorised). */

const BYTE_VALUES = 256;

/** The 256 S-box outputs, indexed by input byte. */
export function buildSbox(): number[] {
  return Array.from({ length: BYTE_VALUES }, (_, x) => sboxEntry(x));
}

/** Inverts a byte permutation table (defaults to the AES S-box). */
export function buildInvSbox(sbox: readonly number[] = SBOX): number[] {
  const inverse = new Array<number>(BYTE_VALUES).fill(0);
  sbox.forEach((output, input) => {
    inverse[output] = input;
  });
  return inverse;
}

/** The S-box, built once and frozen (safe to share, e.g. as a table facet's entries). */
export const SBOX: readonly number[] = Object.freeze(buildSbox());
/** The inverse S-box, built once and frozen. */
export const INV_SBOX: readonly number[] = Object.freeze(buildInvSbox(SBOX));
