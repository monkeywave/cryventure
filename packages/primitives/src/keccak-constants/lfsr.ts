/**
 * The ι round constants from first principles (FIPS 202 §3.2.5). The LFSR register R[0..7] is kept
 * as one byte with bit k = R[k], the coefficient of x^k: the register after t shifts is
 * x^t mod (x⁸ + x⁶ + x⁵ + x⁴ + 1), and rc(t) is its bit 0 (Algorithm 5).
 */

/** x⁸ + x⁶ + x⁵ + x⁴ + 1 as a bit mask (bit k = coefficient of x^k). */
export const LFSR_POLYNOMIAL = 0x171;
/** R = 10000000 in FIPS 202 notation (R[0] = 1): the polynomial 1. */
export const LFSR_START = 0x01;
/** ℓ + 1 = 7 output bits per round (j = 0 … 6, Algorithm 6). */
export const BITS_PER_ROUND = 7;
/** The period of the LFSR (its polynomial is primitive), hence `t mod 255` in Algorithm 5. */
export const LFSR_PERIOD = 255;

/** One LFSR shift: multiply by x and reduce (R ← 0‖R, then R[0], R[4], R[5], R[6] ^= R[8]; truncate). */
export function lfsrShift(register: number): number {
  const shifted = register << 1;
  return shifted & 0x100 ? shifted ^ LFSR_POLYNOMIAL : shifted;
}

/** The register after t shifts: x^t mod the LFSR polynomial (t taken mod 255, as in Algorithm 5). */
export function lfsrRegister(t: number): number {
  let register = LFSR_START;
  for (let shift = 0; shift < t % LFSR_PERIOD; shift++) register = lfsrShift(register);
  return register;
}

/** rc(t) of FIPS 202 Algorithm 5: bit 0 of the register after t shifts. */
export function rc(t: number): 0 | 1 {
  return (lfsrRegister(t) & 1) as 0 | 1;
}

/** The register in FIPS 202 notation, R[0] first (the start value reads "10000000"). */
export function fipsRegisterBits(register: number): string {
  return Array.from({ length: 8 }, (_, k) => String((register >> k) & 1)).join('');
}

/** Bit position 2^j − 1 that rc(j + 7i) lands on in RC[i] (0, 1, 3, 7, 15, 31, 63). */
export const rcBitPosition = (j: number): number => 2 ** j - 1;

/** One LFSR output bit of a round: rc(t) with t = j + 7i, placed at bit 2^j − 1 of RC[i]. */
export interface RoundBit {
  j: number;
  t: number;
  bit: 0 | 1;
  position: number;
}

/** One assembled round constant. */
export interface DerivedRoundConstant {
  round: number;
  bits: RoundBit[];
  value: bigint;
  /** The register after the round's seven shifts: x^(7i + 7) mod the polynomial, where round i + 1 starts. */
  registerAfter: number;
}

/** The word with bit 2^j − 1 = `bit` (zero elsewhere). */
export const bitWord = ({ bit, position }: RoundBit): bigint => BigInt(bit) << BigInt(position);

/** RC[i] by Algorithm 6: the OR of the seven placed bits. */
export function assembleRoundConstant(bits: readonly RoundBit[]): bigint {
  return bits.reduce((value, bit) => value | bitWord(bit), 0n);
}

/** Derives RC[round] from the LFSR, with its seven bits and the register it leaves behind. */
export function deriveRoundConstant(round: number): DerivedRoundConstant {
  const bits = Array.from({ length: BITS_PER_ROUND }, (_, j): RoundBit => {
    const t = j + BITS_PER_ROUND * round;
    return { j, t, bit: rc(t), position: rcBitPosition(j) };
  });
  return { round, bits, value: assembleRoundConstant(bits), registerAfter: lfsrRegister(BITS_PER_ROUND * (round + 1)) };
}
