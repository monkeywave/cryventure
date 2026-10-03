/**
 * GF(2^128) arithmetic for GHASH on 16-byte blocks in GCM bit order (SP 800-38D §6.3): bit 0 is the MSB
 * of byte 0 and is the coefficient of x^0, bit 127 is the LSB of byte 15. Inputs are never mutated.
 */
import type { Bit } from './bits.ts';

/** Size of a field element in bytes. */
export const GF128_BYTES = 16;

/** Number of bits (= Algorithm 1 iterations) in a field element. */
export const GF128_BITS = 128;

/** First byte of R = 11100001 ‖ 0^120 (x^128 ≡ 1 + x + x^2 + x^7 in GCM bit order); the rest is zero. */
export const GF128_R_FIRST_BYTE = 0xe1;

function assertElement(block: Uint8Array, what: string): void {
  if (block.length !== GF128_BYTES)
    throw new RangeError(`${what} must be ${GF128_BYTES} bytes (got ${block.length})`);
}

/** Bit `index` (0..127) of a block in GCM bit order (bit 0 = MSB of byte 0). */
export function gf128Bit(block: Uint8Array, index: number): Bit {
  return ((block[index >> 3] ?? 0) >> (7 - (index & 7))) & 1 ? 1 : 0;
}

/** The 128-bit string shifted right by one bit (towards bit 127; bit 127 drops out, bit 0 becomes 0). */
export function rightShift1(block: Uint8Array): Uint8Array {
  assertElement(block, 'block');
  return Uint8Array.from(
    block,
    (byte, i) => (byte >> 1) | (i > 0 ? ((block[i - 1] ?? 0) & 1) << 7 : 0),
  );
}

/** One iteration i of Algorithm 1: the bit of X it reads, and Z and V after it. */
export interface Gf128MulStep {
  /** Iteration index i = 0..127. */
  bit: number;
  /** x_i, bit i of X; Z ⊕= V iff it is 1. */
  xBit: Bit;
  /** Z_{i+1}. */
  z: Uint8Array;
  /** V_{i+1} = V_i >> 1, ⊕ R iff bit 127 of V_i was 1. */
  v: Uint8Array;
  /** Whether R was XORed into V (bit 127 of V_i was 1). */
  reduced: boolean;
}

export interface Gf128MulSteps {
  x: Uint8Array;
  y: Uint8Array;
  /** One record per bit of X, i = 0..127. */
  steps: Gf128MulStep[];
  /** X·Y, equal to `gf128Mul(x, y)` and to the last `z`. */
  result: Uint8Array;
}

function xorInto(target: Uint8Array, source: Uint8Array): void {
  for (let i = 0; i < target.length; i++) target[i] = (target[i] ?? 0) ^ (source[i] ?? 0);
}

function mulStep(bit: number, xBit: Bit, z: Uint8Array, v: Uint8Array): Gf128MulStep {
  const nextZ = Uint8Array.from(z);
  if (xBit) xorInto(nextZ, v);
  const reduced = gf128Bit(v, GF128_BITS - 1) === 1;
  const nextV = rightShift1(v);
  if (reduced) nextV[0] = (nextV[0] ?? 0) ^ GF128_R_FIRST_BYTE;
  return { bit, xBit, z: nextZ, v: nextV, reduced };
}

/** Explains `gf128Mul(x, y)`: Algorithm 1 of SP 800-38D (§6.3), Z₀ = 0, V₀ = Y, all 128 iterations. */
export function gf128MulSteps(x: Uint8Array, y: Uint8Array): Gf128MulSteps {
  assertElement(x, 'x');
  assertElement(y, 'y');
  const steps: Gf128MulStep[] = [];
  let z: Uint8Array = new Uint8Array(GF128_BYTES);
  let v: Uint8Array = Uint8Array.from(y);
  for (let bit = 0; bit < GF128_BITS; bit++) {
    const step = mulStep(bit, gf128Bit(x, bit), z, v);
    steps.push(step);
    ({ z, v } = step);
  }
  return { x: Uint8Array.from(x), y: Uint8Array.from(y), steps, result: Uint8Array.from(z) };
}

/** X·Y in GF(2^128) (SP 800-38D §6.3, Algorithm 1, right-shift with R = 11100001 ‖ 0^120). */
export function gf128Mul(x: Uint8Array, y: Uint8Array): Uint8Array {
  return gf128MulSteps(x, y).result;
}
