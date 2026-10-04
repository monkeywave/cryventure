import { describe, expect, it } from 'vitest';
import { hashFunction, isPortName, PORT_NAMES, type HashFamily, type HashFunction } from './ports.ts';

describe('PORT_NAMES / isPortName', () => {
  it('lists every port', () => expect(PORT_NAMES).toEqual(['BlockCipher', 'Hash']));

  it('recognises port names only', () => {
    expect(isPortName('BlockCipher')).toBe(true);
    expect(isPortName('Hash')).toBe(true);
    expect(isPortName('StreamCipher')).toBe(false);
    expect(isPortName(1)).toBe(false);
  });
});

describe('hashFunction', () => {
  const fakeHash = (id: string, outputSize: number): HashFunction => ({ id, blockSize: 128, outputSize, hash: () => new Uint8Array(outputSize) });
  const family: HashFamily = { id: 'sha512', functions: [fakeHash('sha-384', 48), fakeHash('sha-512', 64)] };

  it('finds a function of the family by id', () => {
    expect(hashFunction(family, 'sha-512')).toBe(family.functions[1]);
    expect(hashFunction(family, 'sha-384')).toBe(family.functions[0]);
  });

  it('returns undefined for an id the family does not offer', () => {
    expect(hashFunction(family, 'sha-256')).toBeUndefined();
    expect(hashFunction({ id: 'empty', functions: [] }, 'sha-512')).toBeUndefined();
  });
});
