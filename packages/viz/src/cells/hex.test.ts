import { describe, expect, it } from 'vitest';
import { formatHex, formatOffset, toHex } from './hex.ts';

describe('hex formatting', () => {
  it('pads to the element width', () => {
    expect(toHex(0x3a)).toBe('3a');
    expect(toHex(5, 'u16')).toBe('0005');
    expect(toHex(0xdeadbeef, 'u32')).toBe('deadbeef');
    expect(toHex(1, 'u64')).toBe('0000000000000001');
  });

  it('wraps negative i16 values as two’s complement', () => {
    expect(toHex(-1, 'i16')).toBe('ffff');
  });

  it('prefixes values and offsets', () => {
    expect(formatHex(0x3a)).toBe('0x3a');
    expect(formatOffset(16)).toBe('0x0010');
    expect(formatOffset(16, 2)).toBe('0x10');
  });
});
