import { keccak_256, sha3_224, sha3_256, sha3_384, sha3_512, shake128, shake256 } from '@noble/hashes/sha3.js';
import { cshake128, cshake256 } from '@noble/hashes/sha3-addons.js';
import { hashFunction, toHex, utf8Bytes, xofFunction, type HashFamily, type PrimitiveManifest } from '@cryventure/core';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { primitiveProducers, runWithPorts } from '../contracts/runWithPorts.ts';

/**
 * Oracle (docs/M6.md §2g): the traced `sha3` producer must agree with @noble/hashes for random
 * messages of 0–200 bytes, through `run()` (hex input, every detail level, every XOF output length,
 * random cSHAKE N and S) and through its untraced `ports.Hash`: the functions, their incremental
 * contexts over random splits, the XOFs and their contexts over random squeeze splits.
 */
const MAX_MESSAGE_BYTES = 200;
const RUNS = 25;

type Noble = (data: Uint8Array) => Uint8Array;
type NobleXof = (data: Uint8Array, outputLength: number, functionName: Uint8Array, customization: Uint8Array) => Uint8Array;

const HASHES: readonly { id: string; noble: Noble }[] = [
  { id: 'sha3-224', noble: sha3_224 },
  { id: 'sha3-256', noble: sha3_256 },
  { id: 'sha3-384', noble: sha3_384 },
  { id: 'sha3-512', noble: sha3_512 },
  { id: 'keccak-256', noble: keccak_256 },
];

const XOFS: readonly { id: string; noble: NobleXof }[] = [
  { id: 'shake128', noble: (data, dkLen) => shake128(data, { dkLen }) },
  { id: 'shake256', noble: (data, dkLen) => shake256(data, { dkLen }) },
  { id: 'cshake128', noble: (data, dkLen, NISTfn, personalization) => cshake128(data, { dkLen, NISTfn, personalization }) },
  { id: 'cshake256', noble: (data, dkLen, NISTfn, personalization) => cshake256(data, { dkLen, NISTfn, personalization }) },
];

const messageArb = fc.uint8Array({ minLength: 0, maxLength: MAX_MESSAGE_BYTES });
const detailArb = fc.constantFrom('mapping', 'round', 'permutation');
const outputLengthArb = fc.constantFrom('16', '32', '64', '168', '336');
/** N and S as UTF-8 text of at most 64 bytes (ASCII keeps the byte count equal to the length). */
const customTextArb = fc.string({ maxLength: 64, unit: fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz ABCXYZ-0123456789') });
const bytesArb = fc.uint8Array({ minLength: 0, maxLength: 80 });

function manifest(): PrimitiveManifest {
  const found = primitiveProducers.get('sha3');
  if (found === undefined) throw new Error('sha3 manifest not registered');
  return found;
}

async function tracedOutput(params: Record<string, string>): Promise<string> {
  const result = await runWithPorts(manifest(), { encoding: 'hex', outputLength: '32', functionName: '', customization: '', ...params }, primitiveProducers);
  if (!result.ok) throw new Error(`sha3 rejected params: ${result.error.key}`);
  return toHex(result.trace.output['digest'] ?? []);
}

async function hashPort(): Promise<HashFamily> {
  const family = (await manifest().load()).ports?.Hash;
  if (family === undefined) throw new Error('sha3 exposes no Hash port');
  return family;
}

/** `data` cut at the sorted `cuts` (positions modulo its length + 1). */
function pieces(data: Uint8Array, cuts: readonly number[]): Uint8Array[] {
  const points = [...new Set(cuts.map((cut) => cut % (data.length + 1)))].sort((a, b) => a - b);
  return [...points, data.length].map((end, index) => data.subarray(index === 0 ? 0 : points[index - 1]!, end));
}

describe.each(HASHES)('sha3 $id oracle (@noble/hashes)', ({ id, noble }) => {
  it(`run() matches noble for random 0–${MAX_MESSAGE_BYTES}-byte messages (${RUNS} runs)`, async () => {
    await fc.assert(
      fc.asyncProperty(messageArb, detailArb, async (message, detail) => {
        expect(await tracedOutput({ algorithm: id, input: toHex(message), detail })).toBe(toHex(noble(message)));
      }),
      { numRuns: RUNS },
    );
  });

  it(`ports.Hash hash() and create() over random splits match noble (${RUNS * 8} runs)`, async () => {
    const fn = hashFunction(await hashPort(), id)!;
    fc.assert(
      fc.property(messageArb, fc.array(fc.nat(), { maxLength: 4 }), (message, cuts) => {
        const expected = toHex(noble(message));
        expect(toHex(fn.hash(message))).toBe(expected);
        const context = fn.create();
        for (const piece of pieces(message, cuts)) context.update(piece);
        expect(toHex(context.digest())).toBe(expected);
        expect(toHex(context.clone().digest())).toBe(expected);
      }),
      { numRuns: RUNS * 8 },
    );
  });
});

describe.each(XOFS)('sha3 $id oracle (@noble/hashes)', ({ id, noble }) => {
  const customizable = id.startsWith('c');
  const textArb = customizable ? customTextArb : fc.constant('');

  it(`run() matches noble for random messages, output lengths${customizable ? ', N and S' : ''} (${RUNS} runs)`, async () => {
    await fc.assert(
      fc.asyncProperty(messageArb, outputLengthArb, textArb, textArb, detailArb, async (message, outputLength, functionName, customization, detail) => {
        const expected = noble(message, Number(outputLength), utf8Bytes(functionName), utf8Bytes(customization));
        expect(await tracedOutput({ algorithm: id, input: toHex(message), outputLength, functionName, customization, detail })).toBe(toHex(expected));
      }),
      { numRuns: RUNS },
    );
  });

  it(`ports.Hash xof() and create() over random update and squeeze splits match noble (${RUNS * 8} runs)`, async () => {
    const xof = xofFunction(await hashPort(), id)!;
    const customArb = customizable ? bytesArb : fc.constant(new Uint8Array(0));
    fc.assert(
      fc.property(messageArb, fc.array(fc.nat(), { maxLength: 4 }), fc.array(fc.integer({ min: 0, max: 400 }), { minLength: 1, maxLength: 3 }), customArb, customArb, (message, cuts, squeezes, functionName, customization) => {
        const total = squeezes.reduce((sum, length) => sum + length, 0);
        const expected = toHex(noble(message, total, functionName, customization));
        const custom = customizable ? { functionName, customization } : undefined;
        expect(toHex(xof.xof(message, total, custom))).toBe(expected);
        const context = xof.create(custom);
        for (const piece of pieces(message, cuts)) context.update(piece);
        expect(squeezes.map((length) => toHex(context.squeeze(length))).join('')).toBe(expected);
      }),
      { numRuns: RUNS * 8 },
    );
  });
});
