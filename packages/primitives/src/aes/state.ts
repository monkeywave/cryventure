/**
 * The AES state is a 4×4 byte matrix stored column-major: input byte i lands in
 * row i mod 4, column ⌊i/4⌋ (FIPS 197 §3.4). A flat `number[16]` keeps it JSON-friendly.
 */
export const STATE_ROWS = 4;
export const STATE_COLUMNS = 4;
export const BLOCK_BYTES = STATE_ROWS * STATE_COLUMNS;

export type AesState = number[];

/** Flat index of the cell at (row, col) in column-major order. */
export function cellIndex(row: number, col: number): number {
  return row + STATE_ROWS * col;
}

/** Copies a 16-byte block into a state; throws on a wrong length (programming error). */
export function bytesToState(bytes: ArrayLike<number>): AesState {
  if (bytes.length !== BLOCK_BYTES) {
    throw new RangeError(`bytesToState: expected ${BLOCK_BYTES} bytes, got ${bytes.length}`);
  }
  return Array.from(bytes, (byte) => byte & 0xff);
}

/** Copies the state back out as a byte block (column-major order is the byte order). */
export function stateToBytes(state: readonly number[]): number[] {
  return [...state];
}

/** The four bytes of column `col`, top to bottom. */
export function columnOf(state: readonly number[], col: number): number[] {
  return Array.from({ length: STATE_ROWS }, (_, row) => state[cellIndex(row, col)] ?? 0);
}

/** Builds a state from four columns. */
export function stateFromColumns(columns: readonly (readonly number[])[]): AesState {
  return columns.flatMap((column) => [...column]);
}

/** Indices 0..n-1, handy for "every cell" highlights. */
export function allIndices(count: number = BLOCK_BYTES): number[] {
  return Array.from({ length: count }, (_, i) => i);
}
