import { ecb } from '@noble/ciphers/aes.js';
import { toHex, type PrimitiveModule } from '@cryventure/core';
import { primitiveManifests } from '@cryventure/primitives';
import fc from 'fast-check';
import { beforeAll, describe, expect, it } from 'vitest';

/** Oracle: the traced AES plugin must agree with @noble/ciphers AES-ECB on single blocks. */
const BLOCK_BYTES = 16;
const RUNS = 500;

const keyArb = fc.constantFrom(16, 24, 32).chain((length) => fc.uint8Array({ minLength: length, maxLength: length }));
const blockArb = fc.uint8Array({ minLength: BLOCK_BYTES, maxLength: BLOCK_BYTES });

function nobleEncrypt(key: Uint8Array, block: Uint8Array): string {
  return toHex(ecb(key, { disablePadding: true }).encrypt(block));
}

let aes: PrimitiveModule<unknown>;

beforeAll(async () => {
  const manifest = primitiveManifests.find((candidate) => candidate.id === 'aes');
  if (manifest === undefined) throw new Error('AES manifest not registered');
  aes = await manifest.load();
});

function pluginEncrypt(key: Uint8Array, block: Uint8Array): string {
  const result = aes.run({ keyHex: toHex(key), plaintextHex: toHex(block), detail: 'round' });
  if (!result.ok) throw new Error(`AES rejected params: ${result.error.key}`);
  return toHex(result.trace.output['ciphertext'] ?? []);
}

describe('AES oracle (@noble/ciphers)', () => {
  it(`matches AES-ECB for random 128/192/256-bit keys (${RUNS} runs)`, () => {
    fc.assert(
      fc.property(keyArb, blockArb, (key, block) => {
        expect(pluginEncrypt(key, block)).toBe(nobleEncrypt(key, block));
      }),
      { numRuns: RUNS },
    );
  });
});
