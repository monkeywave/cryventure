/**
 * The partial-block buffer of an incremental hash (docs/M6.md §1): whole blocks go to the hash as
 * data arrives, only the bytes after the last whole block stay buffered. Shared by the
 * Merkle–Damgård contexts (SHA-2, MD5, SHA-1) and the absorbing Keccak sponge.
 */
export class BlockBuffer {
  private constructor(
    private readonly partial: Uint8Array,
    private partialLength: number,
  ) {}

  static empty(blockBytes: number): BlockBuffer {
    return new BlockBuffer(new Uint8Array(blockBytes), 0);
  }

  /** The buffered bytes after the last whole block. */
  get tail(): Uint8Array {
    return this.partial.subarray(0, this.partialLength);
  }

  /** Buffers `data`, handing every completed block to `onBlock` in order. */
  feed(data: Uint8Array, onBlock: (block: Uint8Array) => void): void {
    const size = this.partial.length;
    let offset = 0;
    if (this.partialLength > 0) {
      offset = Math.min(size - this.partialLength, data.length);
      this.partial.set(data.subarray(0, offset), this.partialLength);
      this.partialLength += offset;
      if (this.partialLength < size) return;
      onBlock(this.partial);
      this.partialLength = 0;
    }
    for (; offset + size <= data.length; offset += size) onBlock(data.subarray(offset, offset + size));
    this.partial.set(data.subarray(offset));
    this.partialLength = data.length - offset;
  }

  clone(): BlockBuffer {
    return new BlockBuffer(this.partial.slice(), this.partialLength);
  }
}
