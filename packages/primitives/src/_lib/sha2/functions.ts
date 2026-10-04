import type { Word, WordArith } from './words.ts';

/**
 * The SHA-2 logical functions (FIPS 180-4 §4.1.2, §4.1.3), generic over the word size. Each
 * Σ/σ takes its three shift amounts from the family's `Sha2Rotations`.
 */

/** Σ: ROTR^a ⊕ ROTR^b ⊕ ROTR^c. σ: ROTR^a ⊕ ROTR^b ⊕ SHR^c. */
export type ShiftTriple = readonly [number, number, number];

export interface Sha2Rotations {
  /** Σ0 (applied to a). */
  readonly Sigma0: ShiftTriple;
  /** Σ1 (applied to e). */
  readonly Sigma1: ShiftTriple;
  /** σ0 (applied to W_{t−15}); the last amount is a right shift. */
  readonly sigma0: ShiftTriple;
  /** σ1 (applied to W_{t−2}); the last amount is a right shift. */
  readonly sigma1: ShiftTriple;
}

/** Σ{0,1}(x) = ROTR^a(x) ⊕ ROTR^b(x) ⊕ ROTR^c(x). */
export function bigSigma<W extends Word>(arith: WordArith<W>, x: W, [a, b, c]: ShiftTriple): W {
  return arith.xor(arith.xor(arith.rotr(x, a), arith.rotr(x, b)), arith.rotr(x, c));
}

/** σ{0,1}(x) = ROTR^a(x) ⊕ ROTR^b(x) ⊕ SHR^c(x). */
export function smallSigma<W extends Word>(arith: WordArith<W>, x: W, [a, b, c]: ShiftTriple): W {
  return arith.xor(arith.xor(arith.rotr(x, a), arith.rotr(x, b)), arith.shr(x, c));
}

/** Ch(x, y, z) = (x ∧ y) ⊕ (¬x ∧ z): x chooses between y and z bit by bit. */
export function ch<W extends Word>(arith: WordArith<W>, x: W, y: W, z: W): W {
  return arith.xor(arith.and(x, y), arith.and(arith.not(x), z));
}

/** Maj(x, y, z) = (x ∧ y) ⊕ (x ∧ z) ⊕ (y ∧ z): the bitwise majority. */
export function maj<W extends Word>(arith: WordArith<W>, x: W, y: W, z: W): W {
  return arith.xor(arith.xor(arith.and(x, y), arith.and(x, z)), arith.and(y, z));
}
