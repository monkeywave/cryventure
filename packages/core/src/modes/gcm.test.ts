import { describe, expect, it } from 'vitest';
import { parseHexOrThrow, toHex } from '../bytes.ts';
import {
  GCM_TAG_BYTES,
  gcmAccepts,
  gcmDecrypt,
  gcmEncrypt,
  gcmHashSubkey,
  gcmJ0,
  ghash,
} from './gcm.ts';
import { GCM_TEST_CASES } from './gcm.testdata.ts';
import { nobleAes, toyCipher } from './testCiphers.ts';

const hex = (value: string): Uint8Array => parseHexOrThrow(value);
const tc = (n: number) => GCM_TEST_CASES.find((testCase) => testCase.n === n)!;

describe('GCM_TAG_BYTES / gcmAccepts', () => {
  it('lists the SP 800-38D §5.2.1.2 tag lengths', () => {
    expect(GCM_TAG_BYTES).toEqual([16, 15, 14, 13, 12, 8, 4]);
  });
  it('accepts only 128-bit block ciphers', () => {
    expect(gcmAccepts(nobleAes)).toBe(true);
    expect(gcmAccepts(toyCipher)).toBe(false);
  });
});

describe('ghash', () => {
  const h = hex('66e94bd4ef8a2c3b884cfa59ca342b2e');
  it('computes TC 2 GHASH(H, {}, C)', () => {
    const data = hex('0388dace60b6a392f328c2b971b2fe78' + '00000000000000000000000000000080');
    expect(toHex(ghash(h, data))).toBe('f38cbb1ad69223dcc3457ae5b6b0f885');
  });
  it('maps empty input to Y₀ = 0', () => {
    expect(toHex(ghash(h, new Uint8Array(0)))).toBe('00000000000000000000000000000000');
  });
  it('throws RangeError for unaligned data or a wrong-length H', () => {
    expect(() => ghash(h, new Uint8Array(17))).toThrow(RangeError);
    expect(() => ghash(new Uint8Array(15), new Uint8Array(16))).toThrow(RangeError);
  });
});

describe('gcmJ0', () => {
  it('uses IV ‖ 0³¹ ‖ 1 for a 96-bit IV (TC 3)', () => {
    const { h, iv, j0 } = tc(3);
    expect(toHex(gcmJ0(hex(h), hex(iv)))).toBe(j0);
  });
  it('hashes a 60-byte IV (TC 6) and an 8-byte IV (TC 5)', () => {
    for (const { h, iv, j0 } of [tc(6), tc(5)]) {
      expect(toHex(gcmJ0(hex(h), hex(iv)))).toBe(j0);
    }
    expect(tc(6).j0).toBe('3bab75780a31c059f83d2a44752f9864');
  });
  it('throws RangeError for an empty IV, and for a wrong-length H on the GHASH path', () => {
    expect(() => gcmJ0(new Uint8Array(16), new Uint8Array(0))).toThrow(RangeError);
    expect(() => gcmJ0(new Uint8Array(4), new Uint8Array(8))).toThrow(RangeError);
  });
});

describe('GCM known answers (McGrew–Viega test cases 1–18)', () => {
  it('has all 18 cases', () => {
    expect(GCM_TEST_CASES.map((testCase) => testCase.n)).toEqual(
      Array.from({ length: 18 }, (_, i) => i + 1),
    );
  });

  for (const testCase of GCM_TEST_CASES) {
    const { n, key, iv, aad, plaintext, h, ciphertext, tag } = testCase;
    describe(`TC ${n}`, () => {
      it('derives H = E(K, 0¹²⁸)', () => {
        expect(toHex(gcmHashSubkey(nobleAes, hex(key)))).toBe(h);
      });
      it('encrypts', () => {
        const result = gcmEncrypt(nobleAes, hex(key), hex(iv), hex(aad), hex(plaintext), 16);
        expect(toHex(result.ciphertext)).toBe(ciphertext);
        expect(toHex(result.tag)).toBe(tag);
      });
      it('decrypts', () => {
        const result = gcmDecrypt(nobleAes, hex(key), hex(iv), hex(aad), hex(ciphertext), hex(tag));
        expect(result.ok).toBe(true);
        if (result.ok) expect(toHex(result.plaintext)).toBe(plaintext);
      });
      it('rejects a tampered tag without releasing plaintext', () => {
        const tampered = hex(tag);
        tampered[15]! ^= 0x01;
        expect(
          gcmDecrypt(nobleAes, hex(key), hex(iv), hex(aad), hex(ciphertext), tampered),
        ).toEqual({ ok: false });
      });
    });
  }
});

describe('gcmEncrypt / gcmDecrypt edge cases', () => {
  const { key, iv, aad, plaintext, ciphertext, tag } = tc(4);
  const k = hex(key);

  it('truncates the tag to MSB_t for every permitted length', () => {
    for (const tagBytes of GCM_TAG_BYTES) {
      const result = gcmEncrypt(nobleAes, k, hex(iv), hex(aad), hex(plaintext), tagBytes);
      expect(toHex(result.tag)).toBe(tag.slice(0, tagBytes * 2));
      expect(gcmDecrypt(nobleAes, k, hex(iv), hex(aad), result.ciphertext, result.tag).ok).toBe(
        true,
      );
    }
  });

  it('fails on tampered ciphertext or AAD', () => {
    const badCiphertext = hex(ciphertext);
    badCiphertext[0]! ^= 0x80;
    expect(gcmDecrypt(nobleAes, k, hex(iv), hex(aad), badCiphertext, hex(tag))).toEqual({
      ok: false,
    });
    const badAad = hex(aad);
    badAad[19]! ^= 0x01;
    expect(gcmDecrypt(nobleAes, k, hex(iv), badAad, hex(ciphertext), hex(tag))).toEqual({
      ok: false,
    });
  });

  it('does not mutate its inputs', () => {
    const [ivBytes, aadBytes, plaintextBytes] = [hex(iv), hex(aad), hex(plaintext)];
    gcmEncrypt(nobleAes, k, ivBytes, aadBytes, plaintextBytes, 16);
    expect([toHex(ivBytes), toHex(aadBytes), toHex(plaintextBytes)]).toEqual([iv, aad, plaintext]);
  });

  it('throws RangeError for invalid tag lengths, an empty IV or a non-128-bit cipher', () => {
    expect(() => gcmEncrypt(nobleAes, k, hex(iv), hex(aad), hex(plaintext), 11)).toThrow(
      RangeError,
    );
    expect(() =>
      gcmDecrypt(nobleAes, k, hex(iv), hex(aad), hex(ciphertext), new Uint8Array(7)),
    ).toThrow(RangeError);
    expect(() => gcmEncrypt(nobleAes, k, new Uint8Array(0), hex(aad), hex(plaintext), 16)).toThrow(
      RangeError,
    );
    expect(() =>
      gcmEncrypt(toyCipher, new Uint8Array(4), hex(iv), hex(aad), hex(plaintext), 16),
    ).toThrow(RangeError);
  });
});
