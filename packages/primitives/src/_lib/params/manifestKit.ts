/**
 * The one reader for decimal-count params (hkdf `length`, pbkdf2 `iterations` / `length`, the TLS
 * PRFs' `length`). Manifests load eagerly, so this kit imports nothing.
 *
 * Strict by design: only ASCII digits are accepted, with no trimming, sign, decimal point or
 * exponent (`" 42 "`, `"+42"`, `"4.2"`, `"1e2"` are errors). Leading zeros are allowed and dropped,
 * so `"0042"` normalises to `"42"` and the same value always yields the same params (and deep link).
 */

const DIGITS = /^[0-9]+$/;

/** Decimal digits naming an integer in `min … max`, normalised without leading zeros (`"007"` → `"7"`); `undefined` for anything else. */
export function readDigits(input: unknown, range: { readonly min: number; readonly max: number }): string | undefined {
  if (typeof input !== 'string' || !DIGITS.test(input)) return undefined;
  const value = Number(input);
  return value >= range.min && value <= range.max ? String(value) : undefined;
}
