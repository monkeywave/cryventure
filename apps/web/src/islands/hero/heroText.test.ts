import { describe, expect, it } from 'vitest';
import { clampToBytes, textToBlock } from './heroText.ts';

describe('clampToBytes', () => {
  it('keeps text that fits', () => {
    expect(clampToBytes('Hello')).toBe('Hello');
    expect(clampToBytes('0123456789abcdef')).toBe('0123456789abcdef');
  });

  it('cuts at 16 UTF-8 bytes without splitting a code point', () => {
    expect(clampToBytes('0123456789abcdefXYZ')).toBe('0123456789abcdef');
    // "ü" is 2 bytes: 15 ASCII + "ü" = 17 bytes, so the "ü" goes.
    expect(clampToBytes('012345678901234ü')).toBe('012345678901234');
    // An emoji is 4 bytes (a surrogate pair in JS): never half of it.
    expect(clampToBytes('0123456789ab🔑')).toBe('0123456789ab🔑');
    expect(clampToBytes('0123456789abc🔑')).toBe('0123456789abc');
  });
});

describe('textToBlock', () => {
  it('zero-pads the UTF-8 bytes to one block', () => {
    const block = textToBlock('Hi');
    expect(block.plaintextHex).toBe('48690000000000000000000000000000');
    expect(block.textBytes).toBe(2);
    expect(block.paddingBytes).toBe(14);
  });

  it('counts multi-byte characters in bytes', () => {
    const block = textToBlock('Grüße');
    expect(block.textBytes).toBe(7);
    expect(block.plaintextHex.slice(0, 14)).toBe('4772c3bcc39f65');
  });

  it('maps empty text to 16 zero bytes and full text to no padding', () => {
    expect(textToBlock('')).toMatchObject({ textBytes: 0, paddingBytes: 16, plaintextHex: '0'.repeat(32) });
    expect(textToBlock('0123456789abcdefXYZ').paddingBytes).toBe(0);
  });
});
