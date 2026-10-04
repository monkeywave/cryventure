import { blake2b, blake2s } from '@noble/hashes/blake2.js';
import { hashFunction, macFunction, toHex, type HashFamily, type MacFamily, type PrimitiveManifest } from '@cryventure/core';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { primitiveProducers, runWithPorts } from '../contracts/runWithPorts.ts';

/**
 * Oracle (docs/M6.md §2g): the traced `blake2` producer must agree with @noble/hashes (blake2s /
 * blake2b with `dkLen` and `key`) for random messages of 0–128 bytes and random keys, through `run()`
 * (hex input, every detail level), and its untraced `ports.Hash` (unkeyed) through `hash()` and
 * through incremental contexts fed in random pieces; its keyed `ports.Mac` (docs/M7.md §2g) likewise.
 */
const PRODUCER = 'blake2';
const MAX_MESSAGE_BYTES = 128;
const RUNS = 40;

interface OracleCase {
  algorithm: string;
  maxKeyBytes: number;
  noble: (data: Uint8Array, key: Uint8Array) => Uint8Array;
}

function nobleCase(algorithm: string): OracleCase {
  const [flavour, bits] = algorithm.split('-') as [string, string];
  const fn = flavour === 'blake2s' ? blake2s : blake2b;
  const dkLen = Number(bits) / 8;
  return {
    algorithm,
    maxKeyBytes: flavour === 'blake2s' ? 32 : 64,
    noble: (data, key) => fn(data, { dkLen, ...(key.length > 0 ? { key } : {}) }),
  };
}

const ORACLE_CASES: readonly OracleCase[] = ['blake2s-128', 'blake2s-160', 'blake2s-224', 'blake2s-256', 'blake2b-160', 'blake2b-256', 'blake2b-384', 'blake2b-512'].map(nobleCase);

const messageArb = fc.uint8Array({ minLength: 0, maxLength: MAX_MESSAGE_BYTES });
const detailArb = fc.constantFrom('g', 'round', 'block');
/** Split points for feeding a context in pieces (sorted, may repeat: empty updates). */
const splitsArb = fc.array(fc.nat({ max: MAX_MESSAGE_BYTES }), { maxLength: 5 });

function manifest(): PrimitiveManifest {
  const found = primitiveProducers.get(PRODUCER);
  if (found === undefined) throw new Error(`${PRODUCER} manifest not registered`);
  return found;
}

async function tracedDigest(algorithm: string, message: Uint8Array, key: Uint8Array, detail: string): Promise<string> {
  const result = await runWithPorts(manifest(), { algorithm, encoding: 'hex', input: toHex(message), key: toHex(key), detail }, primitiveProducers);
  if (!result.ok) throw new Error(`${PRODUCER} rejected params: ${result.error.key}`);
  return toHex(result.trace.output['digest'] ?? []);
}

async function hashPort(): Promise<HashFamily> {
  const family = (await manifest().load()).ports?.Hash;
  if (family === undefined) throw new Error(`${PRODUCER} exposes no Hash port`);
  return family;
}

async function macPort(): Promise<MacFamily> {
  const family = (await manifest().load()).ports?.Mac;
  if (family === undefined) throw new Error(`${PRODUCER} exposes no Mac port`);
  return family;
}

const pieces = (data: Uint8Array, splits: readonly number[]): Uint8Array[] => {
  const cuts = [0, ...splits.map((at) => Math.min(at, data.length)).sort((a, b) => a - b), data.length];
  return cuts.slice(1).map((end, index) => data.subarray(cuts[index], end));
};

describe.each(ORACLE_CASES)('blake2 $algorithm oracle (@noble/hashes)', ({ algorithm, maxKeyBytes, noble }) => {
  const keyArb = fc.oneof(fc.constant(new Uint8Array()), fc.uint8Array({ minLength: 1, maxLength: maxKeyBytes }));

  it(`run() matches noble for random messages and keys (${RUNS} runs)`, async () => {
    await fc.assert(
      fc.asyncProperty(messageArb, keyArb, detailArb, async (message, key, detail) => {
        expect(await tracedDigest(algorithm, message, key, detail)).toBe(toHex(noble(message, key)));
      }),
      { numRuns: RUNS },
    );
  });

  it(`ports.Hash hash() and contexts match noble for random messages (${RUNS * 5} runs)`, async () => {
    const fn = hashFunction(await hashPort(), algorithm);
    expect(fn).toBeDefined();
    fc.assert(
      fc.property(messageArb, splitsArb, (message, splits) => {
        const expected = toHex(noble(message, new Uint8Array()));
        expect(toHex(fn!.hash(message))).toBe(expected);
        const context = fn!.create();
        for (const piece of pieces(message, splits)) context.update(piece);
        expect(toHex(context.digest())).toBe(expected);
        expect(toHex(context.clone().digest())).toBe(expected);
      }),
      { numRuns: RUNS * 5 },
    );
  });
});

/** Keyed BLAKE2 through `ports.Mac` (docs/M7.md §2a): keys of 1…max bytes (0 is the unkeyed hash, not a MAC). */
describe.each(ORACLE_CASES)('blake2 $algorithm keyed Mac oracle (@noble/hashes)', ({ algorithm, maxKeyBytes, noble }) => {
  const macKeyArb = fc.uint8Array({ minLength: 1, maxLength: maxKeyBytes });

  it(`ports.Mac mac() and contexts over random splits and clones match noble (${RUNS * 2} runs)`, async () => {
    const fn = macFunction(await macPort(), algorithm)!;
    expect(fn).toBeDefined();
    fc.assert(
      fc.property(messageArb, macKeyArb, splitsArb, fc.nat(), (message, key, splits, cloneAt) => {
        const expected = toHex(noble(message, key));
        expect(toHex(fn.mac(key, message))).toBe(expected);
        const parts = pieces(message, splits);
        const split = cloneAt % (parts.length + 1);
        const context = fn.create(key);
        parts.slice(0, split).forEach((part) => context.update(part));
        const clone = context.clone();
        parts.slice(split).forEach((part) => {
          context.update(part);
          clone.update(part);
        });
        expect([toHex(context.mac()), toHex(clone.mac())]).toEqual([expected, expected]);
      }),
      { numRuns: RUNS * 2 },
    );
  });

  it('rejects the empty key and keys longer than the maximum', async () => {
    const fn = macFunction(await macPort(), algorithm)!;
    expect(() => fn.mac(new Uint8Array(), new Uint8Array())).toThrow(RangeError);
    expect(() => fn.mac(new Uint8Array(maxKeyBytes + 1), new Uint8Array())).toThrow(RangeError);
  });
});
