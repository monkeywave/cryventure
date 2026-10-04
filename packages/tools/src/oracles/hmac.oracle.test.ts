import { hmac } from '@noble/hashes/hmac.js';
import { toHex, type MacFunction } from '@cryventure/core';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { hmacMembers, pieces, runOutputHex } from './macOracleKit.ts';

/**
 * Oracle (docs/M7.md §2g): the traced `hmac` lab and every HMAC member of the `Mac` ports must agree
 * with @noble/hashes `hmac` for random keys of 0–256 bytes (incl. keys longer than the block: the
 * hashing branch) and messages of 0–256 bytes: through `run()` (full tag) and through `mac()` and
 * incremental contexts fed in random pieces, cloned and read (`mac()`) mid-stream.
 */
const MAX_BYTES = 256;
const RUNS = 20;

const HMAC_MEMBERS = await hmacMembers();

const keyArb = fc.uint8Array({ minLength: 0, maxLength: MAX_BYTES });
const messageArb = fc.uint8Array({ minLength: 0, maxLength: MAX_BYTES });
const cutsArb = fc.array(fc.nat(), { maxLength: 4 });

/**
 * Feeds `message` in pieces; after the first `cloneAt mod (pieces + 1)` pieces it reads the tag
 * (which must not change the context) and clones, then feeds the rest to both. Returns both tags.
 */
function contextTags(fn: MacFunction, key: Uint8Array, message: Uint8Array, cuts: readonly number[], cloneAt: number): string[] {
  const parts = pieces(message, cuts);
  const split = cloneAt % (parts.length + 1);
  const context = fn.create(key);
  parts.slice(0, split).forEach((part) => context.update(part));
  context.mac();
  const clone = context.clone();
  parts.slice(split).forEach((part) => {
    context.update(part);
    clone.update(part);
  });
  return [toHex(context.mac()), toHex(clone.mac())];
}

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
