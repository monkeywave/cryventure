import { describe, expect, it } from 'vitest';
import {
  hashFunction,
  isMemberPortName,
  isPortName,
  macFunction,
  parsePortMemberRef,
  PORT_NAMES,
  portMember,
  portMemberRef,
  xofFunction,
  type HashContext,
  type HashFamily,
  type HashFunction,
  type MacContext,
  type MacFamily,
  type MacFunction,
  type XofContext,
  type XofFunction,
} from './ports.ts';

describe('PORT_NAMES / isPortName', () => {
  it('lists every port', () => expect(PORT_NAMES).toEqual(['BlockCipher', 'Hash', 'Mac']));

  it('recognises port names only', () => {
    expect(isPortName('BlockCipher')).toBe(true);
    expect(isPortName('Hash')).toBe(true);
    expect(isPortName('Mac')).toBe(true);
    expect(isPortName('StreamCipher')).toBe(false);
    expect(isPortName(1)).toBe(false);
  });
});

describe('hashFunction', () => {
  const fakeContext = (outputSize: number): HashContext => ({ update: () => undefined, digest: () => new Uint8Array(outputSize), clone: () => fakeContext(outputSize) });
  const fakeHash = (id: string, outputSize: number): HashFunction => ({ id, blockSize: 128, outputSize, hash: () => new Uint8Array(outputSize), create: () => fakeContext(outputSize) });
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

describe('xofFunction', () => {
  const fakeXofContext = (): XofContext => ({ update: () => undefined, squeeze: (length) => new Uint8Array(length), clone: fakeXofContext });
  const fakeXof = (id: string, securityBits: number): XofFunction => ({
    id,
    blockSize: securityBits === 128 ? 168 : 136,
    securityBits,
    customizable: false,
    xof: (_data, outputLength) => new Uint8Array(outputLength),
    create: fakeXofContext,
  });
  const family: HashFamily = { id: 'sha3', functions: [], xofs: [fakeXof('shake128', 128), fakeXof('shake256', 256)] };

  it('finds an XOF of the family by id', () => {
    expect(xofFunction(family, 'shake256')).toBe(family.xofs![1]);
    expect(xofFunction(family, 'shake128')).toBe(family.xofs![0]);
  });

  it('returns undefined for an id the family does not offer, or a family without XOFs', () => {
    expect(xofFunction(family, 'cshake128')).toBeUndefined();
    expect(xofFunction({ id: 'sha256', functions: [] }, 'shake128')).toBeUndefined();
  });

  it('does not look at the fixed-length functions', () => {
    expect(xofFunction({ id: 'mixed', functions: [{ id: 'shake128', blockSize: 168, outputSize: 32, hash: () => new Uint8Array(32), create: () => { throw new Error('unused'); } }] }, 'shake128')).toBeUndefined();
  });
});

const fakeMacContext = (outputSize: number): MacContext => ({ update: () => undefined, mac: () => new Uint8Array(outputSize), clone: () => fakeMacContext(outputSize) });
const fakeMac = (id: string, outputSize: number): MacFunction => ({
  id,
  outputSize,
  blockSize: 64,
  keySizes: { min: 0 },
  customizable: false,
  variableOutput: false,
  construction: { kind: 'hmac', hash: `sha256:${id.slice('hmac-'.length)}` },
  mac: () => new Uint8Array(outputSize),
  create: () => fakeMacContext(outputSize),
});
const macFamily: MacFamily = { id: 'sha256', functions: [fakeMac('hmac-sha-224', 28), fakeMac('hmac-sha-256', 32)] };

describe('macFunction', () => {
  it('finds a function of the family by id', () => expect(macFunction(macFamily, 'hmac-sha-256')).toBe(macFamily.functions[1]));

  it('returns undefined for an id the family does not offer', () => {
    expect(macFunction(macFamily, 'hmac-sha-512')).toBeUndefined();
    expect(macFunction({ id: 'empty', functions: [] }, 'hmac-sha-256')).toBeUndefined();
  });
});

describe('isMemberPortName', () => {
  it('recognises the family ports only', () => {
    expect(isMemberPortName('Hash')).toBe(true);
    expect(isMemberPortName('Mac')).toBe(true);
    expect(isMemberPortName('BlockCipher')).toBe(false);
    expect(isMemberPortName('toString')).toBe(false);
    expect(isMemberPortName(undefined)).toBe(false);
  });
});

describe('portMemberRef / parsePortMemberRef', () => {
  it('joins and splits producer and member ids', () => {
    expect(portMemberRef('sha512', 'sha-512/256')).toBe('sha512:sha-512/256');
    expect(parsePortMemberRef('sha512:sha-512/256')).toEqual({ producerId: 'sha512', memberId: 'sha-512/256' });
    expect(parsePortMemberRef(portMemberRef('blake2', 'blake2s-256'))).toEqual({ producerId: 'blake2', memberId: 'blake2s-256' });
  });

  it('rejects refs without exactly one separator between two non-empty parts', () => {
    for (const ref of ['sha256', 'sha256:', ':sha-256', 'a:b:c', '']) expect(parsePortMemberRef(ref), ref).toBeUndefined();
  });
});

describe('portMember', () => {
  const sha256 = { id: 'sha-256', blockSize: 64, outputSize: 32, hash: () => new Uint8Array(32), create: () => { throw new Error('unused'); } } satisfies HashFunction;
  const xof = { id: 'shake128', blockSize: 168, securityBits: 128, customizable: false, xof: (_data: Uint8Array, length: number) => new Uint8Array(length), create: () => { throw new Error('unused'); } } satisfies XofFunction;
  const hashFamily: HashFamily = { id: 'sha256', functions: [sha256], xofs: [xof] };

  it('looks a Hash member up among the functions, not the XOFs', () => {
    expect(portMember('Hash', hashFamily, 'sha-256')).toBe(sha256);
    expect(portMember('Hash', hashFamily, 'shake128')).toBeUndefined();
  });

  it('looks a Mac member up among the functions', () => {
    expect(portMember('Mac', macFamily, 'hmac-sha-224')).toBe(macFamily.functions[0]);
    expect(portMember('Mac', macFamily, 'kmac128')).toBeUndefined();
  });
});
