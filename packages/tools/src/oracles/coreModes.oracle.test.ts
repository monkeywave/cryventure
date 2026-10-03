import { cbc, ctr, ecb } from '@noble/ciphers/aes.js';
import {
  cbcDecrypt,
  cbcEncrypt,
  ctrXor,
  ecbDecrypt,
  ecbEncrypt,
  pkcs7Pad,
  pkcs7Unpad,
  toHex,
  type BlockCipher,
} from '@cryventure/core';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

/** Oracle: core's untraced modes and PKCS#7 padding must agree with @noble/ciphers. */
const BLOCK_BYTES = 16;
const RUNS = 200;

const nobleAesBlockCipher: BlockCipher = {
  id: 'aes',
  blockSize: BLOCK_BYTES,
  keySizes: [16, 24, 32],
  encryptBlock: (key, block) => ecb(key, { disablePadding: true }).encrypt(block),
  decryptBlock: (key, block) => ecb(key, { disablePadding: true }).decrypt(block),
};

const keyArb = fc.constantFrom(16, 24, 32).chain((length) => fc.uint8Array({ minLength: length, maxLength: length }));
const blockArb = fc.uint8Array({ minLength: BLOCK_BYTES, maxLength: BLOCK_BYTES });
const alignedArb = fc
  .integer({ min: 0, max: 8 })
  .chain((blocks) => fc.uint8Array({ minLength: blocks * BLOCK_BYTES, maxLength: blocks * BLOCK_BYTES }));
const anyLengthArb = fc.uint8Array({ maxLength: 100 });
const unpadded = { disablePadding: true };

describe('core modes oracle (@noble/ciphers AES)', () => {
  it(`ECB matches noble both ways (${RUNS} runs)`, () => {
    fc.assert(
      fc.property(keyArb, alignedArb, (key, data) => {
        const expected = ecb(key, unpadded).encrypt(data);
        expect(toHex(ecbEncrypt(nobleAesBlockCipher, key, data))).toBe(toHex(expected));
        expect(toHex(ecbDecrypt(nobleAesBlockCipher, key, data))).toBe(toHex(ecb(key, unpadded).decrypt(data)));
      }),
      { numRuns: RUNS },
    );
  });

  it(`CBC matches noble both ways (${RUNS} runs)`, () => {
    fc.assert(
      fc.property(keyArb, blockArb, alignedArb, (key, iv, data) => {
        expect(toHex(cbcEncrypt(nobleAesBlockCipher, key, iv, data))).toBe(toHex(cbc(key, iv, unpadded).encrypt(data)));
        expect(toHex(cbcDecrypt(nobleAesBlockCipher, key, iv, data))).toBe(toHex(cbc(key, iv, unpadded).decrypt(data)));
      }),
      { numRuns: RUNS },
    );
  });

  it(`CTR matches noble for any length 0..100, including counter wrap-around (${RUNS} runs)`, () => {
    const nearWrapArb = fc.uint8Array({ minLength: 2, maxLength: 2 }).map((low) => {
      const counter = new Uint8Array(BLOCK_BYTES).fill(0xff);
      counter.set(low, BLOCK_BYTES - 2);
      return counter;
    });
    fc.assert(
      fc.property(keyArb, fc.oneof(blockArb, nearWrapArb), anyLengthArb, (key, counter, data) => {
        expect(toHex(ctrXor(nobleAesBlockCipher, key, counter, data))).toBe(toHex(ctr(key, counter).encrypt(data)));
      }),
      { numRuns: RUNS },
    );
  });
});

describe('PKCS#7 oracle (@noble/ciphers ECB padding)', () => {
  it(`pkcs7Pad matches noble's padding and pkcs7Unpad inverts it (${RUNS} runs)`, () => {
    fc.assert(
      fc.property(keyArb, anyLengthArb, (key, data) => {
        const padded = pkcs7Pad(data, BLOCK_BYTES);
        const nobleCiphertext = ecb(key).encrypt(data);
        expect(toHex(ecbEncrypt(nobleAesBlockCipher, key, padded))).toBe(toHex(nobleCiphertext));
        const unpaddedResult = pkcs7Unpad(ecb(key, unpadded).decrypt(nobleCiphertext), BLOCK_BYTES);
        expect(unpaddedResult.ok && toHex(unpaddedResult.data)).toBe(toHex(data));
      }),
      { numRuns: RUNS },
    );
  });

  it(`pkcs7Unpad accepts exactly what noble's unpadding accepts (${RUNS} runs)`, () => {
    const tailArb = fc.uint8Array({ minLength: BLOCK_BYTES, maxLength: BLOCK_BYTES }).chain((block) =>
      fc.integer({ min: 0, max: 20 }).chain((pad) =>
        fc.integer({ min: 0, max: BLOCK_BYTES }).map((fill) => {
          const tail = Uint8Array.from(block);
          tail.fill(pad, BLOCK_BYTES - Math.min(fill, BLOCK_BYTES));
          tail[BLOCK_BYTES - 1] = pad;
          return tail;
        }),
      ),
    );
    fc.assert(
      fc.property(keyArb, tailArb, (key, plainBlock) => {
        const ciphertext = ecb(key, unpadded).encrypt(plainBlock);
        let nobleAccepts = true;
        try {
          ecb(key).decrypt(ciphertext);
        } catch (_error) {
          nobleAccepts = false;
        }
        expect(pkcs7Unpad(plainBlock, BLOCK_BYTES).ok).toBe(nobleAccepts);
      }),
      { numRuns: RUNS },
    );
  });
});
