/**
 * The Rijndael affine transformation over GF(2) (FIPS 197 §5.1.1) and the S-box built from it.
 * Educational implementation: data-dependent branches, NOT constant-time.
 */
import { ginv } from './gf256.ts';
import { bitOf, type Bit } from './bits.ts';

/** The affine constant {63} of FIPS 197 §5.1.1. */
export const AFFINE_CONSTANT = 0x63;

/** Offsets (mod 8) of the input bits XORed into output bit i: b'ᵢ = bᵢ ⊕ bᵢ₊₄ ⊕ bᵢ₊₅ ⊕ bᵢ₊₆ ⊕ bᵢ₊₇ ⊕ cᵢ. */
export const AFFINE_BIT_OFFSETS: readonly number[] = [0, 4, 5, 6, 7];

function rotateLeft8(byte: number, shift: number): number {
  return ((byte << shift) | (byte >> (8 - shift))) & 0xff;
}

/** b ⊕ rotl(b,1) ⊕ rotl(b,2) ⊕ rotl(b,3) ⊕ rotl(b,4) ⊕ {63}. */
export function affine(byte: number): number {
  const b = byte & 0xff;
  return b ^ rotateLeft8(b, 1) ^ rotateLeft8(b, 2) ^ rotateLeft8(b, 3) ^ rotateLeft8(b, 4) ^ AFFINE_CONSTANT;
}

/** One output bit of the affine transformation. */
export interface AffineBitStep {
  /** Output bit position i (0 = LSB). */
  bit: number;
  /** Input bit positions [i, i+4, i+5, i+6, i+7] mod 8. */
  inputBits: number[];
  /** Values of `inputBits` in the input byte, same order. */
  inputValues: Bit[];
  /** Bit i of {63}. */
  constantBit: Bit;
  /** XOR of `inputValues` and `constantBit` = bit i of `affine(x)`. */
  result: Bit;
}

function affineBitStep(input: number, bit: number): AffineBitStep {
  const inputBits = AFFINE_BIT_OFFSETS.map((offset) => (bit + offset) % 8);
  const inputValues = inputBits.map((position) => bitOf(input, position));
  const constantBit = bitOf(AFFINE_CONSTANT, bit);
  const result = inputValues.reduce<Bit>((acc, value) => (acc ^ value) as Bit, constantBit);
  return { bit, inputBits, inputValues, constantBit, result };
}

/** Explains `affine(x)` as eight records, one per output bit i = 0..7. */
export function affineSteps(x: number): AffineBitStep[] {
  return Array.from({ length: 8 }, (_, bit) => affineBitStep(x & 0xff, bit));
}

/** S(x) = affine(x^-1): the S-box is derived, not memorised. */
export function sboxEntry(byte: number): number {
  return affine(ginv(byte));
}
