import { describe, expect, it } from 'vitest';
import { valueId } from './values.ts';

describe('valueId', () => {
  it('joins the scope path and name', () => {
    expect(valueId([0, 3], 'roundKey')).toBe('0/3/roundKey');
    expect(valueId(['tls13', 'hkdf'], 'prk')).toBe('tls13/hkdf/prk');
  });
  it('uses the bare name at the root scope', () => {
    expect(valueId([], 'key')).toBe('key');
  });
  it('is deterministic', () => {
    expect(valueId([1, 2], 'x')).toBe(valueId([1, 2], 'x'));
  });
  it('rejects empty names and names containing the separator', () => {
    expect(() => valueId([0], '')).toThrow(RangeError);
    expect(() => valueId([0], 'a/b')).toThrow(RangeError);
  });
});
