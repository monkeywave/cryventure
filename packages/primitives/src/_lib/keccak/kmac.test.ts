import { parseHexOrThrow, toHex, utf8Bytes } from '@cryventure/core';
import { describe, expect, it } from 'vitest';
import { cloneProblems, patternBytes, splitUpdateProblems } from '../hmac/macPortTestKit.ts';
import { KMAC_VARIANTS, kmacEncodedKey, kmacEncodedLength, kmacFamily, kmacFunction, kmacOutput, kmacPrefix } from './kmac.ts';

/** SP 800-185 KMAC_samples.pdf / KMACXOF_samples.pdf: K = 40 … 5f, X = 00 01 02 03. */
const K = parseHexOrThrow('404142434445464748494a4b4c4d4e4f505152535455565758595a5b5c5d5e5f');
const X = Uint8Array.of(0, 1, 2, 3);
const TAGGED = utf8Bytes('My Tagged Application');
const EMPTY = new Uint8Array(0);
const KMAC128_SAMPLE1 = 'e5780b0d3ea6f7d3a429c5706aa43a00fadbd7d49628839e3187243f456ee14e';
const KMAC256_SAMPLE4 = '20c570c31346f703c9ac36c61c03cb64c3970d0cfc787e9b79599d273a68d2f7f69d4cc3de9d104a351689f27cf6f5951f0103f33f4f24871024d9c27773a8dd';
const KMACXOF128_SAMPLE1 = 'cd83740bbd92ccc8cf032b1481a0f4460e7ca9dd12b08a0c4031178bacd6ec35';

describe('KMAC encodings (SP 800-185 §2.3, §4.3)', () => {
  it('bytepad(encode_string(K), 168): left_encode(168) = 01 a8, left_encode(256) = 02 01 00, K, zeros to one rate block', () => {
    const encoded = kmacEncodedKey(K, 168);
    expect(encoded.length).toBe(168);
    expect(toHex(encoded.subarray(0, 5))).toBe('01a8020100');
    expect(encoded.subarray(5, 37)).toEqual(K);
    expect(encoded.subarray(37).every((byte) => byte === 0)).toBe(true);
    expect(toHex(kmacEncodedKey(EMPTY, 136))).toBe(`0188010000${'00'.repeat(131)}`);
  });

  it('right_encode(L) in bits for KMAC, right_encode(0) for KMACXOF', () => {
    expect(toHex(kmacEncodedLength(32, false))).toBe('010002');
    expect(toHex(kmacEncodedLength(64, false))).toBe('020002');
    expect(toHex(kmacEncodedLength(32, true))).toBe('0001');
  });

  it('the cSHAKE prefix encodes N = "KMAC" (left_encode(32) 01 20, then 4b 4d 41 43) and S', () => {
    const prefix = kmacPrefix(EMPTY, 168);
    expect(prefix.length).toBe(168);
    expect(toHex(prefix.subarray(0, 10))).toBe('01a801204b4d4143' + '0100');
  });
});

describe('kmacOutput (SP 800-185 samples)', () => {
  it('KMAC128 sample #1, KMAC256 sample #4, KMACXOF128 sample #1', () => {
    expect(toHex(kmacOutput(KMAC_VARIANTS.kmac128, K, X, 32, EMPTY))).toBe(KMAC128_SAMPLE1);
    expect(toHex(kmacOutput(KMAC_VARIANTS.kmac256, K, X, 64, TAGGED))).toBe(KMAC256_SAMPLE4);
    expect(toHex(kmacOutput(KMAC_VARIANTS.kmacxof128, K, X, 32, EMPTY))).toBe(KMACXOF128_SAMPLE1);
  });

  it('KMAC binds L (a shorter tag is no prefix of a longer one); KMACXOF does not', () => {
    expect(toHex(kmacOutput(KMAC_VARIANTS.kmac128, K, X, 16, EMPTY))).not.toBe(KMAC128_SAMPLE1.slice(0, 32));
    expect(toHex(kmacOutput(KMAC_VARIANTS.kmacxof128, K, X, 16, EMPTY))).toBe(KMACXOF128_SAMPLE1.slice(0, 32));
  });
});

describe('kmacFunction and kmacFamily (the Mac port)', () => {
  const family = kmacFamily('kmac');

  it('offers kmac128 and kmac256: customizable, variable output, rate as block size, any key length', () => {
    expect(family.id).toBe('kmac');
    expect(family.functions.map(({ id, outputSize, blockSize, keySizes, customizable, variableOutput, construction }) => ({ id, outputSize, blockSize, keySizes, customizable, variableOutput, construction }))).toEqual([
      { id: 'kmac128', outputSize: 32, blockSize: 168, keySizes: { min: 0 }, customizable: true, variableOutput: true, construction: { kind: 'kmac' } },
      { id: 'kmac256', outputSize: 64, blockSize: 136, keySizes: { min: 0 }, customizable: true, variableOutput: true, construction: { kind: 'kmac' } },
    ]);
  });

  it('computes the samples with S and L as options, one-shot and through a context', () => {
    const [kmac128, kmac256] = family.functions;
    expect(toHex(kmac128!.mac(K, X))).toBe(KMAC128_SAMPLE1);
    expect(toHex(kmac256!.mac(K, X, { customization: TAGGED }))).toBe(KMAC256_SAMPLE4);
    const context = kmac256!.create(K, { customization: TAGGED, outputLength: 64 });
    context.update(X.subarray(0, 1));
    context.update(X.subarray(1));
    expect(toHex(context.mac())).toBe(KMAC256_SAMPLE4);
    expect(kmac128!.mac(K, X, { outputLength: 100 }).length).toBe(100);
  });

  it('splits and clones agree with the one-shot tag', () => {
    for (const fn of family.functions) {
      const key = patternBytes(fn.blockSize + 3, 7);
      const message = patternBytes(2 * fn.blockSize + 3, 1);
      expect(splitUpdateProblems(fn, key, message)).toEqual([]);
      expect(cloneProblems(fn, key, message.subarray(0, fn.blockSize))).toEqual([]);
    }
  });

  it('throws a RangeError for a non-positive or fractional output length, and for a KMACXOF member', () => {
    const kmac128 = family.functions[0]!;
    expect(() => kmac128.mac(K, X, { outputLength: 0 })).toThrow(RangeError);
    expect(() => kmac128.create(K, { outputLength: 1.5 })).toThrow(RangeError);
    expect(() => kmacFunction(KMAC_VARIANTS.kmacxof128)).toThrow(RangeError);
  });
});
