import { facetKey, toHex, utf8Bytes, type HashFamily, type HashFunction, type ParamField, type TraceBundle } from '@cryventure/core';
import { describe, expect, it } from 'vitest';
import { checksHashRuns, hashRunProblems, publishedMessage, type HashRunCase, type HashRunManifest } from './hashRunChecks.ts';

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
    create: () => {
      throw new Error('toy: hashRunProblems uses hash() only');
    },
  };
}

const family: HashFamily = { id: 'toy', functions: [toyHash('toy-a', 1), toyHash('toy-b', 2)] };

const select = (name: string, values: readonly string[]): ParamField => ({ name, kind: 'select', labelKey: 'k', options: values.map((value) => ({ value, labelKey: 'k' })) });
const FIELDS: ParamField[] = [select('algorithm', ['toy-a', 'toy-b', 'toy-iv']), { name: 'input', kind: 'text', labelKey: 'k', maxLength: 64 }];

const manifest: HashRunManifest = { implements: ['Hash'], outputs: { digest: { labelKey: 'k' } }, paramFields: FIELDS, defaults: {}, i18nNamespace: 'plugin.toy' };

const hashWith = (id: string, bytes: Uint8Array): number[] => Array.from(family.functions.find((fn) => fn.id === id)!.hash(bytes));

/** A case publishing `message` (omitted when empty) whose digest is what `digestFn` computes over it. */
function honestCase(name: string, algorithm: string, message: number[], digestFn = algorithm): HashRunCase {
  return { name, params: { algorithm }, output: { digest: hashWith(digestFn, Uint8Array.from(message)) }, ...(message.length > 0 ? { message } : {}) };
}

describe('checksHashRuns', () => {
  it('applies to Hash producers with a digest output and an algorithm select param', () => expect(checksHashRuns(manifest)).toBe(true));

  it('does not apply otherwise', () => {
    expect(checksHashRuns({ ...manifest, implements: [] })).toBe(false);
    expect(checksHashRuns({ ...manifest, outputs: {} })).toBe(false);
    expect(checksHashRuns({ ...manifest, paramFields: FIELDS.slice(1) })).toBe(false);
  });
});

describe('publishedMessage', () => {
  const bundle = (values: { id: string; bytes: number[] }[] | undefined): TraceBundle =>
    ({ facets: values === undefined ? {} : { [facetKey('values')]: { kind: 'values', schemaVersion: 1, values: values.map((value) => ({ ...value, labelKey: 'k', role: 'public', createdAt: 0 })) } } }) as unknown as TraceBundle;

  it('reads the bytes of the values facet\'s "message" value', () => {
    expect(publishedMessage(bundle([{ id: 'iv', bytes: [9] }, { id: 'message', bytes: [0x61, 0x62] }]))).toEqual([0x61, 0x62]);
  });

  it('is undefined without a "message" value or a values facet', () => {
    expect(publishedMessage(bundle([{ id: 'iv', bytes: [9] }]))).toBeUndefined();
    expect(publishedMessage(bundle(undefined))).toBeUndefined();
  });
});

describe('hashRunProblems', () => {
  it('passes when every run digest equals the port function over the published message', () => {
    expect(hashRunProblems(family, [honestCase('a', 'toy-a', Array.from(utf8Bytes('abc'))), honestCase('b', 'toy-b', [0x00, 0xff])])).toEqual([]);
  });

  it('hashes the empty message for a case that publishes no message value (empty values are omitted)', () => {
    expect(hashRunProblems(family, [honestCase('abc', 'toy-a', [0x61]), honestCase('empty', 'toy-a', [])])).toEqual([]);
  });

  it('reports a run whose digest the port does not reproduce', () => {
    const swapped = honestCase('swapped', 'toy-a', Array.from(utf8Bytes('abc')), 'toy-b');
    const expected = toHex(hashWith('toy-a', utf8Bytes('abc')));
    expect(hashRunProblems(family, [swapped])).toEqual([`swapped: run digest ${toHex(swapped.output.digest!)}, but Hash port "toy-a" gives ${expected}`]);
  });

  it('skips algorithms the family does not offer (e.g. an IV-generation mode)', () => {
    expect(hashRunProblems(family, [{ name: 'iv', params: { algorithm: 'toy-iv' }, output: { digest: [1, 2, 3, 4] }, message: [1] }])).toEqual([]);
  });

  it('skips every case when the producer publishes no message value at all', () => {
    expect(hashRunProblems(family, [{ name: 'opaque', params: { algorithm: 'toy-a' }, output: { digest: [1, 2, 3, 4] } }])).toEqual([]);
  });

  it('reports a missing digest output', () => {
    expect(hashRunProblems(family, [{ name: 'no digest', params: { algorithm: 'toy-a' }, output: {}, message: [1] }])).toEqual(['no digest: run has no "digest" output']);
  });
});
