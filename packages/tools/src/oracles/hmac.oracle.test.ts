import { hmac } from '@noble/hashes/hmac.js';
import { toHex } from '@cryventure/core';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { contextTags, hashMembers, hmacMembers, LAB_ONLY_NOBLE_HASHES, NOBLE_HASHES, runOutputHex, type NobleHash } from './macOracleKit.ts';

/**
 * Oracle (docs/M7.md §2g): the traced `hmac` lab and every HMAC member of the `Mac` ports must agree
 * with @noble/hashes `hmac` for random keys of 0–256 bytes (incl. keys longer than the block: the
 * hashing branch) and messages of 0–256 bytes: through `run()` (full tag) and through `mac()` and
 * incremental contexts fed in random pieces, cloned and read (`mac()`) mid-stream.
 */
const MAX_BYTES = 256;
const RUNS = 20;

const HMAC_MEMBERS = await hmacMembers();
const HASH_MEMBERS = await hashMembers();
const nobleFor = (ref: string): NobleHash | undefined => NOBLE_HASHES[ref] ?? LAB_ONLY_NOBLE_HASHES[ref];
/** Hash members the `hmac` lab offers without an HMAC `Mac` member to cross-check them (keccak-256, BLAKE2). */
const LAB_ONLY_MEMBERS = HASH_MEMBERS.filter(({ ref }) => !HMAC_MEMBERS.some((member) => member.hashRef === ref)).map((member) => ({ ...member, noble: LAB_ONLY_NOBLE_HASHES[member.ref] }));

const keyArb = fc.uint8Array({ minLength: 0, maxLength: MAX_BYTES });
const messageArb = fc.uint8Array({ minLength: 0, maxLength: MAX_BYTES });
const cutsArb = fc.array(fc.nat(), { maxLength: 4 });

it('finds an HMAC member for every hash with a noble oracle', () => expect(HMAC_MEMBERS.length).toBeGreaterThanOrEqual(12));

describe.each(HMAC_MEMBERS)('hmac $ref oracle (@noble/hashes)', ({ fn, hashRef, noble }) => {
  it(`run() matches noble for random keys and messages of 0–${MAX_BYTES} bytes (${RUNS} runs)`, async () => {
    await fc.assert(
      fc.asyncProperty(fc.oneof(keyArb, fc.uint8Array({ minLength: fn.blockSize + 1, maxLength: MAX_BYTES })), messageArb, async (key, message) => {
        const params = { hash: hashRef, key: toHex(key), encoding: 'hex', input: toHex(message), tagLength: 'full', expected: '' };
        expect(await runOutputHex('hmac', params, 'tag')).toBe(toHex(hmac(noble, key, message)));
      }),
      { numRuns: RUNS },
    );
  });

  it(`ports.Mac mac() and contexts over random splits and clones match noble (${RUNS * 4} runs)`, () => {
    fc.assert(
      fc.property(keyArb, messageArb, cutsArb, fc.nat(), (key, message, cuts, cloneAt) => {
        const expected = toHex(hmac(noble, key, message));
        expect(toHex(fn.mac(key, message))).toBe(expected);
        expect(contextTags(fn, key, message, cuts, cloneAt)).toEqual([expected, expected]);
      }),
      { numRuns: RUNS * 4 },
    );
  });
});

describe('hmac lab over every Hash member (the lab\'s hash picker lists them all)', () => {
  it('has a noble oracle for every Hash member, with noble blockLen = HashFunction.blockSize', () => {
    expect(HASH_MEMBERS.map(({ ref }) => ref).filter((ref) => nobleFor(ref) === undefined)).toEqual([]);
    expect(HASH_MEMBERS.filter(({ ref, fn }) => nobleFor(ref)?.blockLen !== fn.blockSize).map(({ ref, fn }) => `${ref}: ${fn.blockSize} vs ${nobleFor(ref)?.blockLen}`)).toEqual([]);
    expect(LAB_ONLY_MEMBERS.map(({ ref }) => ref).sort()).toEqual(Object.keys(LAB_ONLY_NOBLE_HASHES).sort());
  });

  describe.each(LAB_ONLY_MEMBERS)('hmac lab on $ref (no HMAC Mac member)', ({ ref, fn, noble }) => {
    it(`run() matches noble hmac for random keys and messages of 0–${MAX_BYTES} bytes (${RUNS} runs)`, async () => {
      await fc.assert(
        fc.asyncProperty(fc.oneof(keyArb, fc.uint8Array({ minLength: fn.blockSize + 1, maxLength: MAX_BYTES })), messageArb, async (key, message) => {
          const params = { hash: ref, key: toHex(key), encoding: 'hex', input: toHex(message), tagLength: 'full', expected: '' };
          expect(await runOutputHex('hmac', params, 'tag')).toBe(toHex(hmac(noble!, key, message)));
        }),
        { numRuns: RUNS },
      );
    });
  });
});
