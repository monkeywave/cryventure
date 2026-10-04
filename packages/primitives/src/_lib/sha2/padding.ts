/**
 * SHA-2 padding (FIPS 180-4 §5.1.1 for 64-byte blocks with a 64-bit length, §5.1.2 for 128-byte
 * blocks with a 128-bit length): the message, the bit 1 (byte 0x80 for byte-aligned messages),
 * k zero bits and the message length ℓ in bits, big-endian.
 */
export type Sha2BlockBytes = 64 | 128;

export interface Sha2Padding {
  padded: Uint8Array;
  /** Zero bytes between the 0x80 byte and the length field. */
  zeroBytes: number;
  /** Size of the length field in bytes: 8 (§5.1.1) or 16 (§5.1.2). */
  lengthBytes: number;
  /** ℓ, the message length in bits. */
  messageBits: number;
}

/** The length field size for a block size: blockBytes / 8 (64 → 8 bytes, 128 → 16 bytes). */
export function lengthFieldBytes(blockBytes: Sha2BlockBytes): number {
  return blockBytes / 8;
}

/** Pads `message` to whole blocks; messages here are far below 2^53 bits. */
export function sha2Padding(message: ArrayLike<number>, blockBytes: Sha2BlockBytes): Sha2Padding {
  const lengthBytes = lengthFieldBytes(blockBytes);
  const used = message.length + 1 + lengthBytes;
  const total = Math.ceil(used / blockBytes) * blockBytes;
  const padded = new Uint8Array(total);
  padded.set(message);
  padded[message.length] = 0x80;
  const messageBits = message.length * 8;
  new DataView(padded.buffer).setBigUint64(total - 8, BigInt(messageBits));
  return { padded, zeroBytes: total - used, lengthBytes, messageBits };
}

/** The padded message only. */
export function sha2Pad(message: ArrayLike<number>, blockBytes: Sha2BlockBytes): Uint8Array {
  return sha2Padding(message, blockBytes).padded;
}

/**
 * The final block(s) of an incremental computation: `tail` (the bytes after the last whole block)
 * padded with the length of the whole `messageBytes`-byte message, as `sha2Pad` would end it.
 */
export function sha2PadTail(tail: ArrayLike<number>, messageBytes: number, blockBytes: Sha2BlockBytes): Uint8Array {
  if (tail.length >= blockBytes || messageBytes < tail.length) throw new RangeError(`sha2PadTail: a ${tail.length}-byte tail does not end a ${messageBytes}-byte message in ${blockBytes}-byte blocks`);
  const padded = sha2Pad(tail, blockBytes);
  new DataView(padded.buffer).setBigUint64(padded.length - 8, BigInt(messageBytes) * 8n);
  return padded;
}
