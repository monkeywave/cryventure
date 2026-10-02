/**
 * A field element in FIPS 197 brace notation, lowercase: `{57}`, or `{11b}` with `digits = 3` for
 * an unreduced 9-bit value. A symbol for narration params, not prose.
 */
export function braceHex(value: number, digits = 2): string {
  return `{${value.toString(16).padStart(digits, '0')}}`;
}
