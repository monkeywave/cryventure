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

/**
 * CTR mode (SP 800-38A §6.5): XORs `data` (any length) with E(T₁) ‖ E(T₂) ‖ …, Tᵢ₊₁ = Tᵢ + 1; the last
 * keystream block is truncated. Encryption and decryption are the same operation.
 */
export function ctrXor(cipher: BlockCipher, key: Uint8Array, counterBlock: Uint8Array, data: Uint8Array): Uint8Array {
  const { blockSize } = cipher;
  assertOneBlock(counterBlock, blockSize, 'counter block');
  const out = new Uint8Array(data.length);
  let counter = counterBlock;
  for (let offset = 0; offset < data.length; offset += blockSize) {
    const keystream = cipher.encryptBlock(key, counter);
    const end = Math.min(offset + blockSize, data.length);
    out.set(xorBytes(data.subarray(offset, end), keystream.subarray(0, end - offset)), offset);
    counter = incrementCounter(counter);
  }
  return out;
}
