/** Block helpers shared by the modes of operation (docs/M3.md §3). */

/** Throws a RangeError unless `length` is a whole number of `blockSize`-byte blocks. */
export function assertBlockAligned(length: number, blockSize: number, what = 'data'): void {
  if (!Number.isInteger(blockSize) || blockSize < 1) throw new RangeError(`block size must be a positive integer (got ${blockSize})`);
  if (length % blockSize !== 0) throw new RangeError(`${what} length ${length} is not a multiple of the block size ${blockSize}`);
}

/** Throws a RangeError unless `block` is exactly one block long (IVs, counter blocks). */
export function assertOneBlock(block: Uint8Array, blockSize: number, what: string): void {
  if (block.length !== blockSize) throw new RangeError(`${what} must be ${blockSize} bytes (got ${block.length})`);
}

/** Splits block-aligned `data` into copies of its blocks; throws a RangeError otherwise. */
export function blocksOf(data: Uint8Array, blockSize: number): Uint8Array[] {
  assertBlockAligned(data.length, blockSize);
  return Array.from({ length: data.length / blockSize }, (_, i) => data.slice(i * blockSize, (i + 1) * blockSize));
}

/** Concatenates blocks in order into one new array. */
export function concatBlocks(blocks: readonly Uint8Array[]): Uint8Array {
  const out = new Uint8Array(blocks.reduce((total, block) => total + block.length, 0));
  let offset = 0;
  for (const block of blocks) {
    out.set(block, offset);
    offset += block.length;
  }
  return out;
}
