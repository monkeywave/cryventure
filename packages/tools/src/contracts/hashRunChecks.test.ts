import { toHex, utf8Bytes, type HashFamily, type HashFunction, type ParamField } from '@cryventure/core';
import { describe, expect, it } from 'vitest';
import { checksHashRuns, hashMessageBytes, hashRunProblems, type HashRunManifest } from './hashRunChecks.ts';

/** Toy hash: XOR-folds the input (and its length) into 4 bytes, salted by `salt`. */
function toyHash(id: string, salt: number): HashFunction {
  return {
    id,
    blockSize: 64,
    outputSize: 4,
    hash: (data) => {
      const digest = new Uint8Array(4).fill((data.length + salt) & 0xff);
      data.forEach((byte, i) => { digest[i % 4]! ^= byte; });
      return digest;
    },
  };
}

const family: HashFamily = { id: 'toy', functions: [toyHash('toy-a', 1), toyHash('toy-b', 2)] };

const select = (name: string, values: readonly string[]): ParamField => ({ name, kind: 'select', labelKey: 'k', options: values.map((value) => ({ value, labelKey: 'k' })) });
const FIELDS: ParamField[] = [select('algorithm', ['toy-a', 'toy-b', 'toy-iv']), select('encoding', ['utf8', 'hex']), { name: 'input', kind: 'text', labelKey: 'k', maxLength: 64 }];

const manifest: HashRunManifest = { implements: ['Hash'], outputs: { digest: { labelKey: 'k' } }, paramFields: FIELDS, defaults: {}, i18nNamespace: 'plugin.toy' };

/** A case whose output is what the family computes (optionally with the wrong function or bytes). */
function honestCase(name: string, params: { algorithm: string; encoding?: string; input: string }, digestOf = (bytes: Uint8Array) => family.functions.find((fn) => fn.id === params.algorithm)!.hash(bytes)) {
  const bytes = params.encoding === 'hex' ? Uint8Array.from(Buffer.from(params.input, 'hex')) : utf8Bytes(params.input);
  return { name, params, output: { digest: Array.from(digestOf(bytes)) } };
}

describe('checksHashRuns', () => {
  it('applies to Hash producers with a digest output and an algorithm select param', () => expect(checksHashRuns(manifest)).toBe(true));

  it('does not apply otherwise', () => {
    expect(checksHashRuns({ ...manifest, implements: [] })).toBe(false);
    expect(checksHashRuns({ ...manifest, outputs: {} })).toBe(false);
    expect(checksHashRuns({ ...manifest, paramFields: FIELDS.slice(1) })).toBe(false);
  });
});

describe('hashMessageBytes', () => {
  it('reads the one text param as UTF-8 or, with encoding "hex", as hex', () => {
    expect(hashMessageBytes(FIELDS, { encoding: 'utf8', input: 'abc' })).toEqual(Uint8Array.of(0x61, 0x62, 0x63));
    expect(hashMessageBytes(FIELDS, { encoding: 'hex', input: '6162' })).toEqual(Uint8Array.of(0x61, 0x62));
    expect(hashMessageBytes(FIELDS.filter((field) => field.name !== 'encoding'), { input: 'a' })).toEqual(Uint8Array.of(0x61));
  });

  it('explains why the message cannot be derived', () => {
    expect(hashMessageBytes(FIELDS.slice(0, 2), { encoding: 'utf8' })).toBe('expected exactly one text param holding the message, found 0');
    expect(hashMessageBytes(FIELDS, { encoding: 'base64', input: 'YQ==' })).toBe('encoding "base64" is not "utf8" or "hex"');
    expect(hashMessageBytes(FIELDS, { encoding: 'utf8', input: 3 })).toBe('param "input" is not a string');
    expect(hashMessageBytes(FIELDS, { encoding: 'hex', input: 'zz' })).toMatch(/^param "input" is not hex/);
  });
});

describe('hashRunProblems', () => {
  it('passes when every run digest equals the port function over the same message', () => {
    const cases = [honestCase('a', { algorithm: 'toy-a', encoding: 'utf8', input: 'abc' }), honestCase('b', { algorithm: 'toy-b', encoding: 'hex', input: '00ff' })];
    expect(hashRunProblems(manifest, family, cases)).toEqual([]);
  });

  it('reports a run whose digest the port does not reproduce', () => {
    const wrongFunction = honestCase('swapped', { algorithm: 'toy-a', encoding: 'utf8', input: 'abc' }, (bytes) => family.functions[1]!.hash(bytes));
    const expected = toHex(Array.from(family.functions[0]!.hash(utf8Bytes('abc'))));
    const actual = toHex(wrongFunction.output.digest);
    expect(hashRunProblems(manifest, family, [wrongFunction])).toEqual([`swapped: run digest ${actual}, but Hash port "toy-a" gives ${expected}`]);
  });

  it('skips algorithms the family does not offer (e.g. an IV-generation mode)', () => {
    expect(hashRunProblems(manifest, family, [{ name: 'iv', params: { algorithm: 'toy-iv', encoding: 'utf8', input: '' }, output: { digest: [1, 2, 3, 4] } }])).toEqual([]);
  });

  it('reports a missing digest output and an underivable message', () => {
    expect(hashRunProblems(manifest, family, [{ name: 'no digest', params: { algorithm: 'toy-a', encoding: 'utf8', input: '' }, output: {} }])).toEqual(['no digest: run has no "digest" output']);
    expect(hashRunProblems(manifest, family, [{ name: 'b64', params: { algorithm: 'toy-a', encoding: 'base64', input: '' }, output: { digest: [0] } }])).toEqual([
      'b64: cannot derive the message bytes from params (encoding "base64" is not "utf8" or "hex")',
    ]);
  });
});
