import { describe, expect, it } from 'vitest';
import { parseHexOrThrow, toHex, xorBytes } from '../bytes.ts';
import { ctrXor, inc32, incrementCounter } from './ctr.ts';
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

describe('inc32 (SP 800-38D §6.2)', () => {
  it('adds one to the low 32 bits', () => {
    expect(toHex(inc32(parseHexOrThrow('cafebabefacedbaddecaf88800000001')))).toBe(
      'cafebabefacedbaddecaf88800000002',
    );
  });
  it('carries within the low 32 bits', () => {
    expect(toHex(inc32(parseHexOrThrow('000000000000000000000000000000ff')))).toBe(
      '00000000000000000000000000000100',
    );
  });
  it('wraps …ffffffff to …00000000 and leaves the upper 96 bits unchanged', () => {
    expect(toHex(inc32(parseHexOrThrow('0123456789abcdef01234567ffffffff')))).toBe(
      '0123456789abcdef0123456700000000',
    );
    expect(toHex(inc32(new Uint8Array(16).fill(0xff)))).toBe('ffffffffffffffffffffffff00000000');
  });
  it('returns a new array and does not mutate its input', () => {
    const block = parseHexOrThrow('000000000000000000000000ffffffff');
    expect(inc32(block)).not.toBe(block);
    expect(toHex(block)).toBe('000000000000000000000000ffffffff');
  });
  it('throws RangeError for a block shorter than 4 bytes', () => {
    expect(() => inc32(new Uint8Array(3))).toThrow(RangeError);
  });
});

describe('ctrXor with inc32 (GCTR)', () => {
  const key = parseHexOrThrow(SP800_38A.key128);
  it('uses inc32 for the next counter, so the low 32 bits wrap without carrying', () => {
    const counter = parseHexOrThrow('000102030405060708090a0bffffffff');
    const next = parseHexOrThrow('000102030405060708090a0b00000000');
    const expected = [...nobleAes.encryptBlock(key, counter), ...nobleAes.encryptBlock(key, next)];
    expect(toHex(ctrXor(nobleAes, key, counter, new Uint8Array(32), inc32))).toBe(toHex(expected));
  });
  it('differs from the default whole-block increment exactly when the low 32 bits wrap', () => {
    const counter = parseHexOrThrow('000102030405060708090a0bffffffff');
    const data = new Uint8Array(32);
    expect(toHex(ctrXor(nobleAes, key, counter, data, inc32))).not.toBe(
      toHex(ctrXor(nobleAes, key, counter, data)),
    );
    const noWrap = parseHexOrThrow('000102030405060708090a0b00000001');
    expect(toHex(ctrXor(nobleAes, key, noWrap, data, inc32))).toBe(
      toHex(ctrXor(nobleAes, key, noWrap, data)),
    );
  });
});
