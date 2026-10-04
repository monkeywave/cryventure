import { expand, extract, hkdf } from '@noble/hashes/hkdf.js';
import { toHex, utf8Bytes } from '@cryventure/core';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { concatBytes, hmacMembers, runOutputHex } from './macOracleKit.ts';

/**
 * Oracle (docs/M7.md §2g): the traced `hkdf` producer must agree with @noble/hashes `hkdf`,
 * `extract` and `expand` for every HMAC member of the `Mac` ports and every mode, with random IKM,
 * salt, PRK, info and length. For `expand-label` the HkdfLabel struct (RFC 8446 §7.1) is built here,
 * independently of the producer, and fed to noble `expand` as info.
 */
const RUNS = 20;

const HMAC_MEMBERS = await hmacMembers();

const bytesUpTo = (maxLength: number) => fc.uint8Array({ minLength: 0, maxLength });
/** A TLS 1.3 label of 1…40 printable ASCII characters (without "tls13 "). */
const labelArb = fc.string({ minLength: 1, maxLength: 40, unit: fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz ABC-0123456789') });

/** `struct { uint16 length; opaque label<7..255> = "tls13 " + label; opaque context<0..255>; } HkdfLabel` (RFC 8446 §7.1). */
function hkdfLabel(length: number, label: string, context: Uint8Array): Uint8Array {
  const fullLabel = utf8Bytes(`tls13 ${label}`);
  return concatBytes(Uint8Array.of(length >> 8, length & 0xff, fullLabel.length), fullLabel, Uint8Array.of(context.length), context);
}

describe.each(HMAC_MEMBERS)('hkdf over $ref oracle (@noble/hashes)', ({ ref, fn, noble }) => {
  const hashLen = fn.outputSize;
  const lengthArb = fc.integer({ min: 1, max: Math.min(255, 255 * hashLen) });
  const prkArb = fc.uint8Array({ minLength: hashLen, maxLength: 128 });
  const base = { mac: ref, ikm: '', salt: '', prk: '', infoEncoding: 'hex', info: '', length: '32', label: '', context: '' };

  it(`hkdf and extract modes match noble hkdf / extract for random IKM, salt, info and length (${RUNS} runs)`, async () => {
    await fc.assert(
      fc.asyncProperty(bytesUpTo(128), bytesUpTo(128), bytesUpTo(128), lengthArb, async (ikm, salt, info, length) => {
        const params = { ...base, ikm: toHex(ikm), salt: toHex(salt), info: toHex(info), length: String(length) };
        expect(await runOutputHex('hkdf', { ...params, mode: 'hkdf' }, 'okm')).toBe(toHex(hkdf(noble, ikm, salt, info, length)));
        expect(await runOutputHex('hkdf', { ...params, mode: 'extract' }, 'prk')).toBe(toHex(extract(noble, ikm, salt)));
      }),
      { numRuns: RUNS },
    );
  });

  it(`expand mode matches noble expand for random PRK (≥ HashLen), info and length (${RUNS} runs)`, async () => {
    await fc.assert(
      fc.asyncProperty(prkArb, bytesUpTo(128), lengthArb, async (prk, info, length) => {
        const params = { ...base, mode: 'expand', prk: toHex(prk), info: toHex(info), length: String(length) };
        expect(await runOutputHex('hkdf', params, 'okm')).toBe(toHex(expand(noble, prk, info, length)));
      }),
      { numRuns: RUNS },
    );
  });

  it(`expand-label mode matches noble expand over an independently built HkdfLabel (${RUNS} runs)`, async () => {
    await fc.assert(
      fc.asyncProperty(prkArb, labelArb, bytesUpTo(255), lengthArb, async (prk, label, context, length) => {
        const params = { ...base, mode: 'expand-label', prk: toHex(prk), label, context: toHex(context), length: String(length) };
        expect(await runOutputHex('hkdf', params, 'okm')).toBe(toHex(expand(noble, prk, hkdfLabel(length, label, context), length)));
      }),
      { numRuns: RUNS },
    );
  });
});
