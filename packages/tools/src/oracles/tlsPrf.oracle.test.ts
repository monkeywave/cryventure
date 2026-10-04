import { hmac } from '@noble/hashes/hmac.js';
import { concatBytes } from '@noble/hashes/utils.js';
import { toHex, utf8Bytes } from '@cryventure/core';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { hmacMembers, runOutputHex, type NobleHash } from './macOracleKit.ts';

/**
 * Oracle (docs/M7.md §2g): the traced `tls12-prf` and `tls10-prf` producers must agree with an
 * independent P_hash (RFC 5246 §5) written here on @noble/hashes `hmac`, for random secrets (1–256
 * bytes), ASCII labels, seeds (0–128 bytes) and lengths (1–256): TLS 1.2 over every HMAC member,
 * TLS 1.0 as P_MD5(S1) ⊕ P_SHA-1(S2) with the halves sharing the middle byte of an odd secret
 * (RFC 2246 §5), also over random HMAC member pairs.
 */
const RUNS = 20;

const HMAC_MEMBERS = await hmacMembers();
const member = (ref: string) => HMAC_MEMBERS.find((candidate) => candidate.ref === ref)!;

/** P_hash(secret, seed) = HMAC(secret, A(1) ‖ seed) ‖ HMAC(secret, A(2) ‖ seed) ‖ …, A(0) = seed, A(i) = HMAC(secret, A(i−1)); first `length` bytes. */
function pHash(hash: NobleHash, secret: Uint8Array, seed: Uint8Array, length: number): Uint8Array {
  const output: number[] = [];
  let a = seed;
  while (output.length < length) {
    a = hmac(hash, secret, a);
    output.push(...hmac(hash, secret, concatBytes(a, seed)));
  }
  return Uint8Array.from(output.slice(0, length));
}

/** RFC 2246 §5: S1 = the first ⌈n/2⌉ bytes, S2 = the last ⌈n/2⌉ bytes. */
function tls10Prf(md5: NobleHash, sha1: NobleHash, secret: Uint8Array, labelAndSeed: Uint8Array, length: number): Uint8Array {
  const half = Math.ceil(secret.length / 2);
  const left = pHash(md5, secret.subarray(0, half), labelAndSeed, length);
  const right = pHash(sha1, secret.subarray(secret.length - half), labelAndSeed, length);
  return left.map((byte, index) => byte ^ right[index]!);
}

const secretArb = fc.uint8Array({ minLength: 1, maxLength: 256 });
const labelArb = fc.string({ minLength: 1, maxLength: 64, unit: fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz ABC-0123456789') });
const seedArb = fc.uint8Array({ minLength: 0, maxLength: 128 });
const lengthArb = fc.integer({ min: 1, max: 256 });

const prfParams = (secret: Uint8Array, label: string, seed: Uint8Array, length: number) => ({ secret: toHex(secret), label, seed: toHex(seed), length: String(length) });

describe.each(HMAC_MEMBERS)('tls12-prf over $ref oracle (independent P_hash on @noble/hashes hmac)', ({ ref, noble }) => {
  it(`run() matches P_hash(secret, label ‖ seed) for random inputs (${RUNS} runs)`, async () => {
    await fc.assert(
      fc.asyncProperty(secretArb, labelArb, seedArb, lengthArb, async (secret, label, seed, length) => {
        const expected = pHash(noble, secret, concatBytes(utf8Bytes(label), seed), length);
        expect(await runOutputHex('tls12-prf', { mac: ref, ...prfParams(secret, label, seed, length) }, 'output')).toBe(toHex(expected));
      }),
      { numRuns: RUNS },
    );
  });
});

describe('tls10-prf oracle (independent P_MD5 ⊕ P_SHA-1 on @noble/hashes hmac)', () => {
  const run = async (md5Mac: string, sha1Mac: string, secret: Uint8Array, label: string, seed: Uint8Array, length: number) => {
    const expected = tls10Prf(member(md5Mac).noble, member(sha1Mac).noble, secret, concatBytes(utf8Bytes(label), seed), length);
    expect(await runOutputHex('tls10-prf', { md5Mac, sha1Mac, ...prfParams(secret, label, seed, length) }, 'output')).toBe(toHex(expected));
  };

  it(`run() with the RFC 2246 pair (HMAC-MD5, HMAC-SHA-1) matches for random inputs, odd and even secrets (${RUNS * 3} runs)`, async () => {
    await fc.assert(
      fc.asyncProperty(secretArb, labelArb, seedArb, lengthArb, (secret, label, seed, length) => run('md5:hmac-md5', 'sha1:hmac-sha-1', secret, label, seed, length)),
      { numRuns: RUNS * 3 },
    );
  });

  it(`run() with random HMAC member pairs matches (${RUNS * 2} runs)`, async () => {
    const refArb = fc.constantFrom(...HMAC_MEMBERS.map(({ ref }) => ref));
    await fc.assert(
      fc.asyncProperty(refArb, refArb, secretArb, labelArb, seedArb, lengthArb, (md5Mac, sha1Mac, secret, label, seed, length) => run(md5Mac, sha1Mac, secret, label, seed, length)),
      { numRuns: RUNS * 2 },
    );
  });
});
