/** Every index of a `length`-element region, 0..length-1 (e.g. to highlight a whole row). */
export function allIndices(length: number): number[] {
  return Array.from({ length }, (_, index) => index);
}
