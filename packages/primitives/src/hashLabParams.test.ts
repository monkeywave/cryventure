import type { PrimitiveManifest } from '@cryventure/core';
import { describe, expect, it } from 'vitest';
import blake2Manifest from './blake2/manifest.ts';
import md5Manifest from './md5/manifest.ts';
import sha1Manifest from './sha1/manifest.ts';
import sha256Manifest from './sha256/manifest.ts';
import sha3Manifest from './sha3/manifest.ts';
import sha512Manifest from './sha512/manifest.ts';

/** `PrimitiveManifest.hashLabParams` of every hash producer (docs/M7.md §1e). */

const hex = (bytes: number) => 'ab'.repeat(bytes);

function labParams(manifest: PrimitiveManifest<never>, functionId: string, messageHex: string): Record<string, string> | undefined {
  expect(manifest.hashLabParams).toBeTypeOf('function');
  return manifest.hashLabParams!(functionId, messageHex);
}

/** Params that the manifest's own `validate` accepts. */
function expectValid(manifest: PrimitiveManifest<never>, params: Record<string, string> | undefined): void {
  expect(params).toBeDefined();
  expect(manifest.validate(params).ok).toBe(true);
}

const cases: { manifest: PrimitiveManifest<never>; functions: string[]; limit: number; expected: (fn: string, input: string) => Record<string, string> }[] = [
  { manifest: sha256Manifest as never, functions: ['sha-224', 'sha-256'], limit: 320, expected: (algorithm, input) => ({ algorithm, encoding: 'hex', input, detail: 'round' }) },
  { manifest: sha512Manifest as never, functions: ['sha-384', 'sha-512', 'sha-512/224', 'sha-512/256'], limit: 384, expected: (algorithm, input) => ({ algorithm, encoding: 'hex', input, detail: 'round' }) },
  { manifest: md5Manifest as never, functions: ['md5'], limit: 320, expected: (_, input) => ({ encoding: 'hex', input, detail: 'round' }) },
  { manifest: sha1Manifest as never, functions: ['sha-1'], limit: 320, expected: (_, input) => ({ encoding: 'hex', input, detail: 'round' }) },
  {
    manifest: sha3Manifest as never,
    functions: ['sha3-224', 'sha3-256', 'sha3-384', 'sha3-512', 'keccak-256'],
    limit: 400,
    expected: (algorithm, input) => ({ algorithm, encoding: 'hex', input, outputLength: '32', functionName: '', customization: '', detail: 'mapping' }),
  },
  {
    manifest: blake2Manifest as never,
    functions: ['blake2s-128', 'blake2s-160', 'blake2s-224', 'blake2s-256', 'blake2b-160', 'blake2b-256', 'blake2b-384', 'blake2b-512'],
    limit: 384,
    expected: (algorithm, input) => ({ algorithm, encoding: 'hex', input, key: '', detail: 'g' }),
  },
];

describe.each(cases)('$manifest.id hashLabParams', ({ manifest, functions, limit, expected }) => {
  it('returns valid lab params hashing the message with each port function, up to the lab limit', () => {
    for (const fn of functions) {
      expect(labParams(manifest, fn, hex(3))).toEqual(expected(fn, hex(3)));
      expectValid(manifest, labParams(manifest, fn, ''));
      expectValid(manifest, labParams(manifest, fn, hex(limit)));
    }
  });

  it('declares the `encoding` select as its message field\'s encodingParam', () => {
    expect(manifest.paramFields?.find((field) => field.name === 'input')?.encodingParam).toBe('encoding');
  });

  it('normalises the hex (case, separators) as the lab does', () => {
    expect(labParams(manifest, functions[0]!, 'AB CD')).toEqual(expected(functions[0]!, 'abcd'));
  });

  it('returns undefined past the limit, for invalid hex and for functions the lab does not offer', () => {
    expect(labParams(manifest, functions[0]!, hex(limit + 1))).toBeUndefined();
    expect(labParams(manifest, functions[0]!, 'abc')).toBeUndefined();
    expect(labParams(manifest, functions[0]!, 'zz')).toBeUndefined();
    expect(labParams(manifest, 'no-such-hash', hex(3))).toBeUndefined();
  });
});

describe('hashLabParams: functions outside the fixed-length port functions', () => {
  it('sha3 offers no XOF and sha512 no IV generation', () => {
    for (const xof of ['shake128', 'shake256', 'cshake128', 'cshake256']) expect(labParams(sha3Manifest as never, xof, hex(3))).toBeUndefined();
    expect(labParams(sha512Manifest as never, 'sha-512/t-iv', hex(3))).toBeUndefined();
  });
});
