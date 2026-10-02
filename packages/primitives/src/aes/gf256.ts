/**
 * Arithmetic in GF(2^8) with the AES reduction polynomial x^8 + x^4 + x^3 + x + 1 (FIPS 197 §4).
 * Educational implementation: data-dependent branches, NOT constant-time.
 */
export const AES_POLYNOMIAL = 0x11b;

/** Multiplication by x (i.e. {02}), reducing modulo the AES polynomial. */
export function xtime(byte: number): number {
  const shifted = (byte & 0xff) << 1;
  return (shifted & 0x100 ? shifted ^ AES_POLYNOMIAL : shifted) & 0xff;
}

/** Russian-peasant multiplication: add `a·x^i` for every set bit i of `b`. */
export function gmul(a: number, b: number): number {
  let product = 0;
  let addend = a & 0xff;
  for (let bits = b & 0xff; bits !== 0; bits >>= 1) {
    if (bits & 1) product ^= addend;
    addend = xtime(addend);
  }
  return product;
}

/** `base^exponent` by square-and-multiply. */
export function gpow(base: number, exponent: number): number {
  let result = 1;
  let square = base & 0xff;
  for (let e = exponent; e > 0; e >>= 1) {
    if (e & 1) result = gmul(result, square);
    square = gmul(square, square);
  }
  return result;
}

/** Multiplicative inverse via a^254 = a^-1 (the group has order 255); by convention ginv(0) = 0. */
export function ginv(byte: number): number {
  return (byte & 0xff) === 0 ? 0 : gpow(byte, 254);
}
