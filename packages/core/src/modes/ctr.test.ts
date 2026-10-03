import { describe, expect, it } from 'vitest';
import { parseHexOrThrow, toHex, xorBytes } from '../bytes.ts';
import { ctrXor, incrementCounter } from './ctr.ts';
import { nobleAes, toyCipher } from './testCiphers.ts';
import { SP800_38A } from './sp80038a.testdata.ts';

const toyKey = Uint8Array.of(0x10, 0x20, 0x30, 0x40);
const toyCounter = Uint8Array.of(0, 0, 0, 0xff);

describe('incrementCounter', () => {
  it('adds one big-endian', () => {
    expect([...incrementCounter(Uint8Array.of(0, 0, 0, 1))]).toEqual([0, 0, 0, 2]);
  });
  it('carries across bytes', () => {
    expect([...incrementCounter(Uint8Array.of(0, 0x01, 0xff, 0xff))]).toEqual([0, 0x02, 0, 0]);
  });
  it('wraps modulo 2^(8·len)', () => {
    expect([...incrementCounter(new Uint8Array(16).fill(0xff))]).toEqual(new Array(16).fill(0));
  });
  it('returns a new array', () => {
    const block = Uint8Array.of(1, 2);
    expect(incrementCounter(block)).not.toBe(block);
    expect([...block]).toEqual([1, 2]);
  });
});

describe('ctrXor (toy cipher)', () => {
  it('XORs with E(counter), E(counter+1), …', () => {
    const k0 = toyCipher.encryptBlock(toyKey, toyCounter);
    const k1 = toyCipher.encryptBlock(toyKey, incrementCounter(toyCounter));
    const data = Uint8Array.of(1, 2, 3, 4, 5, 6, 7, 8);
    expect(toHex(ctrXor(toyCipher, toyKey, toyCounter, data))).toBe(toHex(xorBytes(data, [...k0, ...k1])));
  });
  it('truncates the keystream for a partial last block', () => {
    const data = Uint8Array.of(1, 2, 3, 4, 5, 6);
    const full = ctrXor(toyCipher, toyKey, toyCounter, Uint8Array.of(1, 2, 3, 4, 5, 6, 0, 0));
    expect(toHex(ctrXor(toyCipher, toyKey, toyCounter, data))).toBe(toHex(full.slice(0, 6)));
  });
  it('is its own inverse', () => {
    const data = Uint8Array.of(9, 8, 7, 6, 5, 4, 3);
    expect([...ctrXor(toyCipher, toyKey, toyCounter, ctrXor(toyCipher, toyKey, toyCounter, data))]).toEqual([...data]);
  });
  it('maps empty input to empty output and does not mutate the counter', () => {
    const counter = Uint8Array.from(toyCounter);
    expect(ctrXor(toyCipher, toyKey, counter, new Uint8Array(0)).length).toBe(0);
    ctrXor(toyCipher, toyKey, counter, new Uint8Array(9));
    expect([...counter]).toEqual([...toyCounter]);
  });
  it('throws RangeError for a wrong counter length', () => {
    expect(() => ctrXor(toyCipher, toyKey, new Uint8Array(3), new Uint8Array(4))).toThrow(RangeError);
  });
});

describe('CTR known answers (SP 800-38A F.5.1/F.5.2, AES-128)', () => {
  const key = parseHexOrThrow(SP800_38A.key128);
  const counter = parseHexOrThrow(SP800_38A.ctrCounter);
  it('F.5.1 encrypt (counter wraps across the low bytes)', () => {
    expect(toHex(ctrXor(nobleAes, key, counter, parseHexOrThrow(SP800_38A.plaintext)))).toBe(SP800_38A.ctr128);
  });
  it('F.5.2 decrypt', () => {
    expect(toHex(ctrXor(nobleAes, key, counter, parseHexOrThrow(SP800_38A.ctr128)))).toBe(SP800_38A.plaintext);
  });
});
