/** A single bit value. */
export type Bit = 0 | 1;

/** Bit `position` of `value` (0 = LSB). */
export function bitOf(value: number, position: number): Bit {
  return (value >> position) & 1 ? 1 : 0;
}
