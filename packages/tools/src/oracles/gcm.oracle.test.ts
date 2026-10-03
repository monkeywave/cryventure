import { gcm } from '@noble/ciphers/aes.js';
import { ghash } from '@noble/ciphers/_polyval.js';
import { getFacet, GCM_TAG_BYTES, toHex, type PrimitiveManifest, type TraceBundle, type ValuesFacet } from '@cryventure/core';
import { primitiveManifests } from '@cryventure/primitives';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { primitiveProducers, runWithPorts } from '../contracts/runWithPorts.ts';

/**
 * Oracle: the traced `gcm` producer (with the AES plugin as its cipher) must agree with
 * @noble/ciphers `gcm` for random keys (16/24/32 bytes), IVs (the 8–64 bytes noble accepts; 12 is
 * the fast path), AAD and input of 0–64 bytes and every tag length, and its GHASH value S must equal
 * noble's `ghash` over A ‖ 0^v ‖ C ‖ 0^u ‖ [len(A)]₆₄ ‖ [len(C)]₆₄ (docs/M4.md §2c).
 */
const BLOCK_BYTES = 16;
const MAX_BYTES = 64;
const NOBLE_MIN_IV_BYTES = 8;
const RUNS = 150;

const keyArb = fc.constantFrom(16, 24, 32).chain((length) => fc.uint8Array({ minLength: length, maxLength: length }));
const ivArb = fc.oneof(fc.constant(12), fc.integer({ min: NOBLE_MIN_IV_BYTES, max: MAX_BYTES })).chain((length) => fc.uint8Array({ minLength: length, maxLength: length }));
const dataArb = fc.uint8Array({ minLength: 0, maxLength: MAX_BYTES });
const tagBytesArb = fc.constantFrom(...GCM_TAG_BYTES);

function manifest(): PrimitiveManifest {
  const found = primitiveManifests.find((candidate) => candidate.id === 'gcm');
  if (found === undefined) throw new Error('gcm manifest not registered');
  return found;
}

interface GcmCase {
  key: Uint8Array;
  iv: Uint8Array;
  aad: Uint8Array;
  input: Uint8Array;
  tagBytes: number;
}

async function runGcm(testCase: GcmCase, direction: 'encrypt' | 'decrypt', tag: Uint8Array = new Uint8Array()): Promise<TraceBundle> {
  const params = { cipher: 'aes', keyHex: toHex(testCase.key), ivHex: toHex(testCase.iv), aadHex: toHex(testCase.aad), inputHex: toHex(testCase.input), direction, tagHex: toHex(tag), tagBytes: String(testCase.tagBytes) };
  const result = await runWithPorts(manifest(), params, primitiveProducers);
  if (!result.ok) throw new Error(`gcm rejected params: ${result.error.key}`);
  return result.trace;
}

const hexOutputs = (trace: TraceBundle) => Object.fromEntries(Object.entries(trace.output).map(([name, bytes]) => [name, toHex(bytes)]));

/** noble's ciphertext and full 16-byte tag. */
function nobleEncrypt({ key, iv, aad, input }: GcmCase): { ciphertext: Uint8Array; tag: Uint8Array } {
  const sealed = gcm(key, iv, aad).encrypt(input);
  return { ciphertext: sealed.subarray(0, input.length), tag: sealed.subarray(input.length) };
}

const zeroPadded = (data: Uint8Array) => Uint8Array.from({ length: Math.ceil(data.length / BLOCK_BYTES) * BLOCK_BYTES }, (_, index) => data[index] ?? 0);

function lengthBlock(aBytes: number, cBytes: number): Uint8Array {
  const block = new Uint8Array(BLOCK_BYTES);
  const view = new DataView(block.buffer);
  view.setBigUint64(0, BigInt(aBytes * 8));
  view.setBigUint64(8, BigInt(cBytes * 8));
  return block;
}

const valueHex = (trace: TraceBundle, id: string) => toHex(getFacet<ValuesFacet>(trace, 'values')!.values.find((value) => value.id === id)?.bytes ?? []);

const caseArb = fc.record({ key: keyArb, iv: ivArb, aad: dataArb, input: dataArb, tagBytes: tagBytesArb });

describe('gcm producer oracle (@noble/ciphers AES-GCM)', () => {
  it(`encrypts like noble, with the tag truncated to MSB_t (${RUNS} runs)`, async () => {
    await fc.assert(
      fc.asyncProperty(caseArb, async (testCase) => {
        const expected = nobleEncrypt(testCase);
        expect(hexOutputs(await runGcm(testCase, 'encrypt'))).toEqual({ ciphertext: toHex(expected.ciphertext), tag: toHex(expected.tag.subarray(0, testCase.tagBytes)) });
      }),
      { numRuns: RUNS },
    );
  });

  it(`decrypts what noble sealed, and outputs {} once a tag bit is flipped (${RUNS} runs)`, async () => {
    await fc.assert(
      fc.asyncProperty(caseArb, fc.nat(), async (testCase, flip) => {
        const { ciphertext, tag } = nobleEncrypt(testCase);
        const sealed = { ...testCase, input: ciphertext };
        const truncated = tag.slice(0, testCase.tagBytes);
        expect(hexOutputs(await runGcm(sealed, 'decrypt', truncated))).toEqual({ plaintext: toHex(testCase.input) });
        const forged = Uint8Array.from(truncated);
        const bit = flip % (testCase.tagBytes * 8);
        forged[bit >> 3] = (forged[bit >> 3] ?? 0) ^ (0x80 >> (bit & 7));
        expect((await runGcm(sealed, 'decrypt', forged)).output).toEqual({});
      }),
      { numRuns: RUNS },
    );
  });

  it(`computes S like noble's ghash (${RUNS} runs)`, async () => {
    await fc.assert(
      fc.asyncProperty(caseArb, async (testCase) => {
        const trace = await runGcm(testCase, 'encrypt');
        const ciphertext = Uint8Array.from(trace.output['ciphertext'] ?? []);
        const message = Uint8Array.from([...zeroPadded(testCase.aad), ...zeroPadded(ciphertext), ...lengthBlock(testCase.aad.length, ciphertext.length)]);
        const h = Uint8Array.from(getFacet<ValuesFacet>(trace, 'values')!.values.find((value) => value.id === 'h')?.bytes ?? []);
        expect(valueHex(trace, 's')).toBe(toHex(ghash(message, h)));
      }),
      { numRuns: RUNS },
    );
  });

  it('handles empty AAD and empty input (GMAC with an empty message) like noble', async () => {
    const testCase: GcmCase = { key: new Uint8Array(16), iv: new Uint8Array(12), aad: new Uint8Array(), input: new Uint8Array(), tagBytes: 16 };
    expect(hexOutputs(await runGcm(testCase, 'encrypt'))).toEqual({ ciphertext: '', tag: toHex(nobleEncrypt(testCase).tag) });
  });
});
