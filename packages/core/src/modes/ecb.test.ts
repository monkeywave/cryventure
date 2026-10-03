import { describe, expect, it } from 'vitest';
import { parseHexOrThrow, toHex } from '../bytes.ts';
import { ecbDecrypt, ecbEncrypt } from './ecb.ts';
import { nobleAes, toyCipher } from './testCiphers.ts';
import { SP800_38A } from './sp80038a.testdata.ts';

const toyKey = Uint8Array.of(0x10, 0x20, 0x30, 0x40);

describe('ecbEncrypt / ecbDecrypt (toy cipher)', () => {
  it('encrypts each block independently: equal plaintext blocks give equal ciphertext blocks', () => {
    const ciphertext = ecbEncrypt(toyCipher, toyKey, Uint8Array.of(1, 2, 3, 4, 1, 2, 3, 4));
    expect(toHex(ciphertext.slice(0, 4))).toBe(toHex(ciphertext.slice(4)));
    expect(toHex(ciphertext.slice(0, 4))).toBe(toHex(toyCipher.encryptBlock(toyKey, Uint8Array.of(1, 2, 3, 4))));
  });
  it('round-trips', () => {
    const plaintext = Uint8Array.of(9, 8, 7, 6, 5, 4, 3, 2);
    expect([...ecbDecrypt(toyCipher, toyKey, ecbEncrypt(toyCipher, toyKey, plaintext))]).toEqual([...plaintext]);
  });
  it('maps empty input to empty output', () => {
    expect(ecbEncrypt(toyCipher, toyKey, new Uint8Array(0)).length).toBe(0);
  });
  it('throws RangeError for input that is not block aligned', () => {
    expect(() => ecbEncrypt(toyCipher, toyKey, new Uint8Array(5))).toThrow(RangeError);
    expect(() => ecbDecrypt(toyCipher, toyKey, new Uint8Array(3))).toThrow(RangeError);
  });
});

describe('ECB known answers (SP 800-38A F.1.1/F.1.2, AES-128)', () => {
  const key = parseHexOrThrow(SP800_38A.key128);
  it('F.1.1 encrypt', () => {
    expect(toHex(ecbEncrypt(nobleAes, key, parseHexOrThrow(SP800_38A.plaintext)))).toBe(SP800_38A.ecb128);
  });
  it('F.1.2 decrypt', () => {
    expect(toHex(ecbDecrypt(nobleAes, key, parseHexOrThrow(SP800_38A.ecb128)))).toBe(SP800_38A.plaintext);
  });
});
