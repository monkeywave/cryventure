import { describe, expect, it } from 'vitest';
import { parseHexOrThrow, toHex, xorBytes } from '../bytes.ts';
import { cbcDecrypt, cbcEncrypt } from './cbc.ts';
import { nobleAes, toyCipher } from './testCiphers.ts';
import { SP800_38A } from './sp80038a.testdata.ts';

const toyKey = Uint8Array.of(0x10, 0x20, 0x30, 0x40);
const toyIv = Uint8Array.of(0xa0, 0xb0, 0xc0, 0xd0);

describe('cbcEncrypt / cbcDecrypt (toy cipher)', () => {
  it('chains: C1 = E(P1 ⊕ IV), C2 = E(P2 ⊕ C1)', () => {
    const p1 = Uint8Array.of(1, 2, 3, 4);
    const p2 = Uint8Array.of(5, 6, 7, 8);
    const c1 = toyCipher.encryptBlock(toyKey, xorBytes(p1, toyIv));
    const c2 = toyCipher.encryptBlock(toyKey, xorBytes(p2, c1));
    const ciphertext = cbcEncrypt(toyCipher, toyKey, toyIv, Uint8Array.from([...p1, ...p2]));
    expect(toHex(ciphertext)).toBe(toHex([...c1, ...c2]));
  });
  it('hides equal plaintext blocks', () => {
    const ciphertext = cbcEncrypt(toyCipher, toyKey, toyIv, Uint8Array.of(1, 2, 3, 4, 1, 2, 3, 4));
    expect(toHex(ciphertext.slice(0, 4))).not.toBe(toHex(ciphertext.slice(4)));
  });
  it('round-trips', () => {
    const plaintext = Uint8Array.of(9, 8, 7, 6, 5, 4, 3, 2, 1, 0, 1, 2);
    expect([...cbcDecrypt(toyCipher, toyKey, toyIv, cbcEncrypt(toyCipher, toyKey, toyIv, plaintext))]).toEqual([...plaintext]);
  });
  it('does not mutate the IV or the input', () => {
    const iv = Uint8Array.from(toyIv);
    const data = Uint8Array.of(1, 2, 3, 4);
    cbcDecrypt(toyCipher, toyKey, iv, cbcEncrypt(toyCipher, toyKey, iv, data));
    expect([...iv]).toEqual([...toyIv]);
    expect([...data]).toEqual([1, 2, 3, 4]);
  });
  it('throws RangeError for unaligned input or a wrong IV length', () => {
    expect(() => cbcEncrypt(toyCipher, toyKey, toyIv, new Uint8Array(5))).toThrow(RangeError);
    expect(() => cbcDecrypt(toyCipher, toyKey, toyIv, new Uint8Array(6))).toThrow(RangeError);
    expect(() => cbcEncrypt(toyCipher, toyKey, new Uint8Array(3), new Uint8Array(4))).toThrow(RangeError);
    expect(() => cbcDecrypt(toyCipher, toyKey, new Uint8Array(5), new Uint8Array(4))).toThrow(RangeError);
  });
});

describe('CBC known answers (SP 800-38A F.2.1/F.2.2, AES-128)', () => {
  const key = parseHexOrThrow(SP800_38A.key128);
  const iv = parseHexOrThrow(SP800_38A.cbcIv);
  it('F.2.1 encrypt', () => {
    expect(toHex(cbcEncrypt(nobleAes, key, iv, parseHexOrThrow(SP800_38A.plaintext)))).toBe(SP800_38A.cbc128);
  });
  it('F.2.2 decrypt', () => {
    expect(toHex(cbcDecrypt(nobleAes, key, iv, parseHexOrThrow(SP800_38A.cbc128)))).toBe(SP800_38A.plaintext);
  });
});
