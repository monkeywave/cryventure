import { describe, expect, it } from 'vitest';
import { valueId, valueRef } from './values.ts';

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

describe('valueRef', () => {
  it('labels the value in the plugin namespace with a root-scope id by default', () => {
    expect(valueRef('plugin.xor', 'key', 'key', [1, 2], 1)).toEqual({ id: 'key', labelKey: 'plugin.xor.value.key', role: 'key', bytes: [1, 2], createdAt: 1 });
  });

  it('derives the id from the scope path', () => {
    expect(valueRef('plugin.aes', 'roundKey', 'subkey', [0], 4, [3]).id).toBe('3/roundKey');
  });
});
