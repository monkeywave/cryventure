import { ginv } from './gf256.ts';

/** The affine constant {63} of FIPS 197 §5.1.1. */
export const AFFINE_CONSTANT = 0x63;

function rotateLeft8(byte: number, shift: number): number {
  return ((byte << shift) | (byte >> (8 - shift))) & 0xff;
}

/** b ⊕ rotl(b,1) ⊕ rotl(b,2) ⊕ rotl(b,3) ⊕ rotl(b,4) ⊕ {63}. */
export function affine(byte: number): number {
  const b = byte & 0xff;
  return (
    b ^
    rotateLeft8(b, 1) ^
    rotateLeft8(b, 2) ^
    rotateLeft8(b, 3) ^
    rotateLeft8(b, 4) ^
    AFFINE_CONSTANT
  );
}

/** S(x) = affine(x^-1): the S-box is derived, not memorised. */
export function sboxEntry(byte: number): number {
  return affine(ginv(byte));
}

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
