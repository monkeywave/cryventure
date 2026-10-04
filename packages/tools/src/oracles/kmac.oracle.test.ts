import { kmac128, kmac128xof, kmac256, kmac256xof } from '@noble/hashes/sha3-addons.js';
import { macFunction, toHex, utf8Bytes, type MacFamily } from '@cryventure/core';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { contextTags, producer, runOutputHex } from './macOracleKit.ts';

/**
 * Oracle (docs/M7.md §2g): the traced `kmac` producer must agree with @noble/hashes kmac128/kmac256
 * (and kmac128xof/kmac256xof for KMACXOF) for random keys (0–64 bytes), messages (0–200 bytes),
 * customization strings and output lengths through `run()`, and its `ports.Mac` (KMAC128/256) for
 * random keys, customizations and output lengths through `mac()` and contexts over random splits.
 */
const RUNS = 25;

type NobleKmac = typeof kmac128;

const ALGORITHMS: readonly { algorithm: string; noble: NobleKmac }[] = [
  { algorithm: 'kmac128', noble: kmac128 },
  { algorithm: 'kmac256', noble: kmac256 },
  { algorithm: 'kmacxof128', noble: kmac128xof },
  { algorithm: 'kmacxof256', noble: kmac256xof },
];

const PORT_MEMBERS: readonly { id: string; noble: NobleKmac }[] = [
  { id: 'kmac128', noble: kmac128 },
  { id: 'kmac256', noble: kmac256 },
];

const keyArb = fc.uint8Array({ minLength: 0, maxLength: 64 });
const messageArb = fc.uint8Array({ minLength: 0, maxLength: 200 });
const outputLengthArb = fc.constantFrom('16', '32', '64', '168');
const detailArb = fc.constantFrom('mapping', 'round', 'permutation');
/** S as UTF-8 text of at most 64 bytes (ASCII keeps the byte count equal to the length). */
const customizationArb = fc.string({ maxLength: 64, unit: fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz ABCXYZ-0123456789') });

async function macPort(): Promise<MacFamily> {
  const family = (await producer('kmac').load()).ports?.Mac;
  if (family === undefined) throw new Error('kmac exposes no Mac port');
  return family;
}

describe.each(ALGORITHMS)('kmac $algorithm oracle (@noble/hashes)', ({ algorithm, noble }) => {
  it(`run() matches noble for random keys, messages, S and output lengths (${RUNS} runs)`, async () => {
    await fc.assert(
      fc.asyncProperty(keyArb, messageArb, customizationArb, outputLengthArb, detailArb, async (key, message, customization, outputLength, detail) => {
        const params = { algorithm, key: toHex(key), encoding: 'hex', input: toHex(message), customization, outputLength, detail };
        const expected = noble(key, message, { dkLen: Number(outputLength), personalization: utf8Bytes(customization) });
        expect(await runOutputHex('kmac', params, 'tag')).toBe(toHex(expected));
      }),
      { numRuns: RUNS },
    );
  });
});

describe.each(PORT_MEMBERS)('kmac $id ports.Mac oracle (@noble/hashes)', ({ id, noble }) => {
  it(`mac() and contexts over random splits and clones match noble (${RUNS * 4} runs)`, async () => {
    const fn = macFunction(await macPort(), id)!;
    expect(fn).toBeDefined();
    const optionArb = fc.record({ customization: fc.uint8Array({ maxLength: 80 }), outputLength: fc.integer({ min: 1, max: 400 }) }, { requiredKeys: [] });
    fc.assert(
      fc.property(fc.uint8Array({ maxLength: 200 }), messageArb, optionArb, fc.array(fc.nat(), { maxLength: 4 }), fc.nat(), (key, message, options, cuts, cloneAt) => {
        const expected = toHex(noble(key, message, { dkLen: options.outputLength ?? fn.outputSize, personalization: options.customization ?? new Uint8Array() }));
        expect(toHex(fn.mac(key, message, options))).toBe(expected);
        expect(contextTags(fn, key, message, cuts, cloneAt, options)).toEqual([expected, expected]);
      }),
      { numRuns: RUNS * 4 },
    );
  });
});
