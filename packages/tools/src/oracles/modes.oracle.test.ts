import { cbc, ctr, ecb } from '@noble/ciphers/aes.js';
import { toHex, type ModeDirection, type ModePadding, type PrimitiveManifest } from '@cryventure/core';
import { primitiveManifests } from '@cryventure/primitives';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { primitiveProducers, runWithPorts } from '../contracts/runWithPorts.ts';

/**
 * Oracle: the traced mode producers `ecb`, `cbc` and `ctr` (with the AES plugin as their cipher)
 * must agree with @noble/ciphers, for random keys (16/24/32 bytes), IVs, counters and lengths,
 * with and without PKCS#7, in both directions.
 */
const BLOCK_BYTES = 16;
const MAX_INPUT_BYTES = 64;
const RUNS = 200;

const keyArb = fc.constantFrom(16, 24, 32).chain((length) => fc.uint8Array({ minLength: length, maxLength: length }));
const blockArb = fc.uint8Array({ minLength: BLOCK_BYTES, maxLength: BLOCK_BYTES });
const paddingArb = fc.constantFrom<ModePadding>('pkcs7', 'none');
/** Plaintext for encryption: any length that still fits 64 bytes once padded (pkcs7) or whole blocks (none). */
const plaintextFor = (padding: ModePadding) =>
  padding === 'pkcs7'
    ? fc.uint8Array({ minLength: 1, maxLength: MAX_INPUT_BYTES - 1 })
    : fc.integer({ min: 1, max: MAX_INPUT_BYTES / BLOCK_BYTES }).chain((blocks) => fc.uint8Array({ minLength: blocks * BLOCK_BYTES, maxLength: blocks * BLOCK_BYTES }));
const alignedArb = fc.integer({ min: 1, max: MAX_INPUT_BYTES / BLOCK_BYTES }).chain((blocks) => fc.uint8Array({ minLength: blocks * BLOCK_BYTES, maxLength: blocks * BLOCK_BYTES }));

function manifest(id: string): PrimitiveManifest {
  const found = primitiveManifests.find((candidate) => candidate.id === id);
  if (found === undefined) throw new Error(`${id} manifest not registered`);
  return found;
}

/** Runs producer `id` with AES and returns its outputs as hex. */
async function runMode(id: string, params: Record<string, string>): Promise<Record<string, string>> {
  const result = await runWithPorts(manifest(id), { cipher: 'aes', ...params }, primitiveProducers);
  if (!result.ok) throw new Error(`${id} rejected params: ${result.error.key}`);
  return Object.fromEntries(Object.entries(result.trace.output).map(([name, bytes]) => [name, toHex(bytes)]));
}

const noblePadding = (padding: ModePadding) => ({ disablePadding: padding === 'none' });

/** What a decryption must output: `plaintext` when noble accepts the padding, else `padded` (all blocks). */
function expectedDecryption(decrypt: (options: { disablePadding: boolean }) => Uint8Array, padding: ModePadding): Record<string, string> {
  const raw = toHex(decrypt({ disablePadding: true }));
  if (padding === 'none') return { plaintext: raw };
  try {
    return { plaintext: toHex(decrypt({ disablePadding: false })) };
  } catch {
    return { padded: raw };
  }
}

const directions: ModeDirection[] = ['encrypt', 'decrypt'];

describe('mode producers oracle (@noble/ciphers AES)', () => {
  it(`ECB encrypts like noble, with and without PKCS#7 (${RUNS} runs)`, async () => {
    await fc.assert(
      fc.asyncProperty(keyArb, paddingArb.chain((padding) => fc.tuple(fc.constant(padding), plaintextFor(padding))), async (key, [padding, data]) => {
        const outputs = await runMode('ecb', { keyHex: toHex(key), inputHex: toHex(data), direction: 'encrypt', padding });
        expect(outputs).toEqual({ ciphertext: toHex(ecb(key, noblePadding(padding)).encrypt(data)) });
      }),
      { numRuns: RUNS },
    );
  });

  it(`ECB decrypts like noble, reporting invalid PKCS#7 as padded output (${RUNS} runs)`, async () => {
    await fc.assert(
      fc.asyncProperty(keyArb, paddingArb, alignedArb, async (key, padding, data) => {
        const outputs = await runMode('ecb', { keyHex: toHex(key), inputHex: toHex(data), direction: 'decrypt', padding });
        expect(outputs).toEqual(expectedDecryption((options) => ecb(key, options).decrypt(data), padding));
      }),
      { numRuns: RUNS },
    );
  });

  it(`CBC encrypts like noble, with and without PKCS#7 (${RUNS} runs)`, async () => {
    await fc.assert(
      fc.asyncProperty(keyArb, blockArb, paddingArb.chain((padding) => fc.tuple(fc.constant(padding), plaintextFor(padding))), async (key, iv, [padding, data]) => {
        const outputs = await runMode('cbc', { keyHex: toHex(key), ivHex: toHex(iv), inputHex: toHex(data), direction: 'encrypt', padding });
        expect(outputs).toEqual({ ciphertext: toHex(cbc(key, iv, noblePadding(padding)).encrypt(data)) });
      }),
      { numRuns: RUNS },
    );
  });

  it(`CBC decrypts like noble, reporting invalid PKCS#7 as padded output (${RUNS} runs)`, async () => {
    await fc.assert(
      fc.asyncProperty(keyArb, blockArb, paddingArb, alignedArb, async (key, iv, padding, data) => {
        const outputs = await runMode('cbc', { keyHex: toHex(key), ivHex: toHex(iv), inputHex: toHex(data), direction: 'decrypt', padding });
        expect(outputs).toEqual(expectedDecryption((options) => cbc(key, iv, options).decrypt(data), padding));
      }),
      { numRuns: RUNS },
    );
  });

  it(`decrypting what noble encrypted with PKCS#7 gives the plaintext back (ECB and CBC, ${RUNS} runs)`, async () => {
    await fc.assert(
      fc.asyncProperty(keyArb, blockArb, plaintextFor('pkcs7'), async (key, iv, data) => {
        const ecbOut = await runMode('ecb', { keyHex: toHex(key), inputHex: toHex(ecb(key).encrypt(data)), direction: 'decrypt', padding: 'pkcs7' });
        const cbcOut = await runMode('cbc', { keyHex: toHex(key), ivHex: toHex(iv), inputHex: toHex(cbc(key, iv).encrypt(data)), direction: 'decrypt', padding: 'pkcs7' });
        expect(ecbOut).toEqual({ plaintext: toHex(data) });
        expect(cbcOut).toEqual({ plaintext: toHex(data) });
      }),
      { numRuns: RUNS },
    );
  });

  it.each(directions)(`CTR matches noble for any length 1..64 (%s is the same operation, ${RUNS} runs)`, async (direction) => {
    await fc.assert(
      fc.asyncProperty(keyArb, blockArb, fc.uint8Array({ minLength: 1, maxLength: MAX_INPUT_BYTES }), async (key, counter, data) => {
        const input = direction === 'encrypt' ? data : ctr(key, counter).encrypt(data);
        const expected = direction === 'encrypt' ? ctr(key, counter).encrypt(data) : data;
        const outputs = await runMode('ctr', { keyHex: toHex(key), counterHex: toHex(counter), inputHex: toHex(input) });
        expect(outputs['output']).toBe(toHex(expected));
        expect(outputs['keystream']).toBe(toHex(ctr(key, counter).encrypt(new Uint8Array(data.length))));
      }),
      { numRuns: RUNS },
    );
  });

  it('CTR wraps the counter block around mod 2¹²⁸ like noble', async () => {
    const key = new Uint8Array(16);
    const counter = new Uint8Array(BLOCK_BYTES).fill(0xff);
    const data = new Uint8Array(48).fill(0x5a);
    const outputs = await runMode('ctr', { keyHex: toHex(key), counterHex: toHex(counter), inputHex: toHex(data) });
    expect(outputs['output']).toBe(toHex(ctr(key, counter).encrypt(data)));
  });
});
