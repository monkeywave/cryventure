import { md5, sha1 } from '@noble/hashes/legacy.js';
import { hashFunction, toHex, type HashFunction, type PrimitiveManifest } from '@cryventure/core';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { primitiveProducers, runWithPorts } from '../contracts/runWithPorts.ts';

/**
 * Oracle (docs/M6.md §2g): the traced `md5` and `sha1` producers must agree with @noble/hashes
 * (`legacy`) for random messages of 0–128 bytes, through `run()` (hex input, both detail levels) and
 * through their untraced `ports.Hash`: `hash()` and incremental contexts fed in random pieces.
 */
const MAX_MESSAGE_BYTES = 128;
const RUNS = 60;

interface OracleCase {
  producer: string;
  id: string;
  noble: (data: Uint8Array) => Uint8Array;
}

const ORACLE_CASES: readonly OracleCase[] = [
  { producer: 'md5', id: 'md5', noble: md5 },
  { producer: 'sha1', id: 'sha-1', noble: sha1 },
];

const messageArb = fc.uint8Array({ minLength: 0, maxLength: MAX_MESSAGE_BYTES });
const detailArb = fc.constantFrom('round', 'block');
/** A message and cut points that split it into consecutive `update` pieces. */
const splitArb = fc.tuple(fc.uint8Array({ minLength: 0, maxLength: 3 * 64 + 7 }), fc.array(fc.nat(), { maxLength: 6 }));

function manifest(id: string): PrimitiveManifest {
  const found = primitiveProducers.get(id);
  if (found === undefined) throw new Error(`${id} manifest not registered`);
  return found;
}

async function tracedDigest(producer: string, message: Uint8Array, detail: string): Promise<string> {
  const result = await runWithPorts(manifest(producer), { encoding: 'hex', input: toHex(message), detail }, primitiveProducers);
  if (!result.ok) throw new Error(`${producer} rejected params: ${result.error.key}`);
  return toHex(result.trace.output['digest'] ?? []);
}

async function portFunction({ producer, id }: OracleCase): Promise<HashFunction> {
  const family = (await manifest(producer).load()).ports?.Hash;
  const fn = family === undefined ? undefined : hashFunction(family, id);
  if (fn === undefined) throw new Error(`${producer} exposes no Hash function ${id}`);
  return fn;
}

/** The digest of a context fed `message` in the pieces between the sorted `cuts`. */
function contextDigest(fn: HashFunction, message: Uint8Array, cuts: readonly number[]): Uint8Array {
  const offsets = [0, ...cuts.map((cut) => cut % (message.length + 1)).sort((a, b) => a - b), message.length];
  const context = fn.create();
  offsets.slice(1).forEach((end, index) => context.update(message.subarray(offsets[index], end)));
  return context.digest();
}

describe.each(ORACLE_CASES)('$producer oracle (@noble/hashes legacy $id)', (oracleCase) => {
  it(`run() matches noble for random 0–${MAX_MESSAGE_BYTES}-byte messages (${RUNS} runs)`, async () => {
    await fc.assert(
      fc.asyncProperty(messageArb, detailArb, async (message, detail) => {
        expect(await tracedDigest(oracleCase.producer, message, detail)).toBe(toHex(oracleCase.noble(message)));
      }),
      { numRuns: RUNS },
    );
  });

  it(`ports.Hash hash() matches noble for random 0–${MAX_MESSAGE_BYTES}-byte messages (${RUNS * 5} runs)`, async () => {
    const fn = await portFunction(oracleCase);
    fc.assert(
      fc.property(messageArb, (message) => {
        expect(toHex(fn.hash(message))).toBe(toHex(oracleCase.noble(message)));
      }),
      { numRuns: RUNS * 5 },
    );
  });

  it(`ports.Hash contexts fed in random pieces match noble, and a clone continues independently (${RUNS * 5} runs)`, async () => {
    const fn = await portFunction(oracleCase);
    fc.assert(
      fc.property(splitArb, fc.uint8Array({ maxLength: 70 }), ([message, cuts], suffix) => {
        expect(toHex(contextDigest(fn, message, cuts))).toBe(toHex(oracleCase.noble(message)));
        const context = fn.create();
        context.update(message);
        const clone = context.clone();
        clone.update(suffix);
        expect(toHex(context.digest())).toBe(toHex(oracleCase.noble(message)));
        expect(toHex(clone.digest())).toBe(toHex(oracleCase.noble(Uint8Array.of(...message, ...suffix))));
      }),
      { numRuns: RUNS * 5 },
    );
  });
});
