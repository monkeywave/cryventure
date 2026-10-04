import { sha224, sha256, sha384, sha512, sha512_224, sha512_256 } from '@noble/hashes/sha2.js';
import { hashFunction, toHex, type HashFamily, type PrimitiveManifest } from '@cryventure/core';
import { primitiveManifests } from '@cryventure/primitives';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { primitiveProducers, runWithPorts } from '../contracts/runWithPorts.ts';

/**
 * Oracle (docs/M5.md §2f): the traced SHA-2 producers must agree with @noble/hashes for random
 * messages of 0–128 bytes, both through `run()` (hex input, both detail levels) and through their
 * untraced `ports.Hash`.
 */
const MAX_MESSAGE_BYTES = 128;
const RUNS = 60;

interface OracleCase {
  producer: string;
  algorithm: string;
  noble: (data: Uint8Array) => Uint8Array;
}

const ORACLE_CASES: readonly OracleCase[] = [
  { producer: 'sha256', algorithm: 'sha-224', noble: sha224 },
  { producer: 'sha256', algorithm: 'sha-256', noble: sha256 },
  { producer: 'sha512', algorithm: 'sha-384', noble: sha384 },
  { producer: 'sha512', algorithm: 'sha-512', noble: sha512 },
  { producer: 'sha512', algorithm: 'sha-512/224', noble: sha512_224 },
  { producer: 'sha512', algorithm: 'sha-512/256', noble: sha512_256 },
];

const messageArb = fc.uint8Array({ minLength: 0, maxLength: MAX_MESSAGE_BYTES });
const detailArb = fc.constantFrom('round', 'block');

function manifest(id: string): PrimitiveManifest {
  const found = primitiveManifests.find((candidate) => candidate.id === id);
  if (found === undefined) throw new Error(`${id} manifest not registered`);
  return found;
}

async function tracedDigest({ producer, algorithm }: OracleCase, message: Uint8Array, detail: string): Promise<string> {
  const result = await runWithPorts(manifest(producer), { algorithm, encoding: 'hex', input: toHex(message), detail }, primitiveProducers);
  if (!result.ok) throw new Error(`${producer} rejected params: ${result.error.key}`);
  return toHex(result.trace.output['digest'] ?? []);
}

async function hashPort(producer: string): Promise<HashFamily> {
  const family = (await manifest(producer).load()).ports?.Hash;
  if (family === undefined) throw new Error(`${producer} exposes no Hash port`);
  return family;
}

describe.each(ORACLE_CASES)('$producer $algorithm oracle (@noble/hashes)', (oracleCase) => {
  it(`run() matches noble for random 0–${MAX_MESSAGE_BYTES}-byte messages (${RUNS} runs)`, async () => {
    await fc.assert(
      fc.asyncProperty(messageArb, detailArb, async (message, detail) => {
        expect(await tracedDigest(oracleCase, message, detail)).toBe(toHex(oracleCase.noble(message)));
      }),
      { numRuns: RUNS },
    );
  });

  it(`ports.Hash matches noble for random 0–${MAX_MESSAGE_BYTES}-byte messages (${RUNS * 5} runs)`, async () => {
    const fn = hashFunction(await hashPort(oracleCase.producer), oracleCase.algorithm);
    expect(fn).toBeDefined();
    fc.assert(
      fc.property(messageArb, (message) => {
        expect(toHex(fn!.hash(message))).toBe(toHex(oracleCase.noble(message)));
      }),
      { numRuns: RUNS * 5 },
    );
  });
});
