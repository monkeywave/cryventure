import { xorBytes } from '../bytes.ts';
import type { BlockCipher } from '../ports.ts';
import { assertOneBlock } from './blocks.ts';

/** The whole block as a big-endian integer plus one, mod 2^(8·length) (SP 800-38A B.1, m = b). */
export function incrementCounter(block: Uint8Array): Uint8Array {
  const next = Uint8Array.from(block);
  for (let i = next.length - 1; i >= 0; i--) {
    next[i] = ((next[i] ?? 0) + 1) & 0xff;
    if (next[i] !== 0) break;
  }
  return next;
}

/** Size in bytes of the counter field that `inc32` increments (the low 32 bits). */
const INC32_COUNTER_BYTES = 4;

/**
 * GCM's inc₃₂ (SP 800-38D §6.2): the low 32 bits + 1 mod 2³², the other bits unchanged; returns a new
 * array. Throws a RangeError for a block shorter than 4 bytes.
 */
export function inc32(block: Uint8Array): Uint8Array {
  if (block.length < INC32_COUNTER_BYTES)
    throw new RangeError(`inc32 needs at least ${INC32_COUNTER_BYTES} bytes (got ${block.length})`);
  const next = Uint8Array.from(block);
  const counterStart = block.length - INC32_COUNTER_BYTES;
  next.set(incrementCounter(block.subarray(counterStart)), counterStart);
  return next;
}

/**
 * CTR mode (SP 800-38A §6.5): XORs `data` (any length) with E(T₁) ‖ E(T₂) ‖ …, Tᵢ₊₁ = Tᵢ + 1; the last
 * keystream block is truncated. Encryption and decryption are the same operation. `increment` defaults to
 * the whole-block `incrementCounter`; with `inc32` this is GCM's GCTR (SP 800-38D §6.5).
 */
export function ctrXor(
  cipher: BlockCipher,
  key: Uint8Array,
  counterBlock: Uint8Array,
  data: Uint8Array,
  increment: (block: Uint8Array) => Uint8Array = incrementCounter,
): Uint8Array {
  const { blockSize } = cipher;
  assertOneBlock(counterBlock, blockSize, 'counter block');
  const out = new Uint8Array(data.length);
  let counter = counterBlock;
  for (let offset = 0; offset < data.length; offset += blockSize) {
    const keystream = cipher.encryptBlock(key, counter);
    const end = Math.min(offset + blockSize, data.length);
    out.set(xorBytes(data.subarray(offset, end), keystream.subarray(0, end - offset)), offset);
    counter = increment(counter);
  }
  return out;
}
