import { describe, expect, it } from 'vitest';
import { loadPrimitiveMessages } from './messages.ts';

describe('loadPrimitiveMessages', () => {
  it('returns one plugin catalog in one locale', () => {
    const de = loadPrimitiveMessages('aes', 'de-CH');
    expect(de['plugin.aes.value.ciphertext']).toBe('Geheimtext');
    expect(Object.keys(de).every((key) => key.startsWith('plugin.aes.'))).toBe(true);
    expect(loadPrimitiveMessages('aes', 'en')['plugin.aes.value.ciphertext']).toBe('Ciphertext');
  });

  it('is empty for an unknown plugin', () => {
    expect(loadPrimitiveMessages('nope', 'en')).toEqual({});
  });
});
