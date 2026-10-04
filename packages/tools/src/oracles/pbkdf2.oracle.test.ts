import { pbkdf2 } from '@noble/hashes/pbkdf2.js';
import { toHex } from '@cryventure/core';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { hmacMembers, runOutputHex } from './macOracleKit.ts';

/**
 * Oracle (docs/M7.md §2g): the traced `pbkdf2` producer must agree with @noble/hashes `pbkdf2` for
 * every HMAC member of the `Mac` ports, random passwords and salts (0–128 bytes, hex), iteration
 * counts 1…50 (past 8 the recording skips iterations: the skipped F must still be right) and
 * lengths 1…128 bytes (several blocks for the short hashes).
 */
const RUNS = 20;
const MAX_ITERATIONS = 50;

const HMAC_MEMBERS = await hmacMembers();

const bytesArb = fc.uint8Array({ minLength: 0, maxLength: 128 });

describe.each(HMAC_MEMBERS)('pbkdf2 over $ref oracle (@noble/hashes)', ({ ref, noble }) => {
  it(`run() matches noble for random password, salt, c ≤ ${MAX_ITERATIONS} and length (${RUNS} runs)`, async () => {
    await fc.assert(
      fc.asyncProperty(bytesArb, bytesArb, fc.integer({ min: 1, max: MAX_ITERATIONS }), fc.integer({ min: 1, max: 128 }), async (password, salt, c, dkLen) => {
        const params = { mac: ref, passwordEncoding: 'hex', password: toHex(password), saltEncoding: 'hex', salt: toHex(salt), iterations: String(c), length: String(dkLen) };
        expect(await runOutputHex('pbkdf2', params, 'dk')).toBe(toHex(pbkdf2(noble, password, salt, { c, dkLen })));
      }),
      { numRuns: RUNS },
    );
  });
});
