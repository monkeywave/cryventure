import { ecb } from '@noble/ciphers/aes.js';
import { xorBytes } from '../bytes.ts';
import type { BlockCipher } from '../ports.ts';

/**
 * Test-only block ciphers for the mode tests (not exported from the package).
 * `toyCipher`: 4-byte blocks, E(k, b) = rotl1(b ⊕ k). Insecure, but not an involution, so an
 * encrypt/decrypt mix-up in a mode shows up.
 */
export const toyCipher: BlockCipher = {
  id: 'toy',
  blockSize: 4,
  keySizes: [4],
  encryptBlock: (key, block) => {
    const mixed = xorBytes(block, key);
    return Uint8Array.from(mixed, (_, i) => mixed[(i + 1) % mixed.length] ?? 0);
  },
  decryptBlock: (key, block) => {
    const unrotated = Uint8Array.from(block, (_, i) => block[(i + block.length - 1) % block.length] ?? 0);
    return xorBytes(unrotated, key);
  },
};

/** AES via @noble/ciphers ECB without padding, as a `BlockCipher` (test oracle). */
export const nobleAes: BlockCipher = {
  id: 'aes',
  blockSize: 16,
  keySizes: [16, 24, 32],
  encryptBlock: (key, block) => ecb(key, { disablePadding: true }).encrypt(block),
  decryptBlock: (key, block) => ecb(key, { disablePadding: true }).decrypt(block),
};
