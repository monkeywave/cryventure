import { facetKey, toHex, utf8Bytes, type HashFamily, type HashFunction, type ParamField, type TraceBundle, type XofCustomization, type XofFunction } from '@cryventure/core';
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

  it('also applies without an algorithm select (a single-function producer such as md5 or sha1)', () => {
    expect(checksHashRuns({ ...manifest, paramFields: FIELDS.slice(1) })).toBe(true);
  });

  it('does not apply otherwise', () => {
    expect(checksHashRuns({ ...manifest, implements: [] })).toBe(false);
    expect(checksHashRuns({ ...manifest, outputs: {} })).toBe(false);
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

describe('hashRunProblems without an algorithm param', () => {
  const single: HashFamily = { id: 'toy', functions: [toyHash('toy-a', 1)] };
  const message = Array.from(utf8Bytes('abc'));

  it('uses the only function of a single-function family', () => {
    const honest: HashRunCase = { name: 'honest', params: { input: 'abc' }, output: { digest: hashWith('toy-a', utf8Bytes('abc')) }, message };
    const wrong: HashRunCase = { name: 'wrong', params: { input: 'abc' }, output: { digest: hashWith('toy-b', utf8Bytes('abc')) }, message };
    expect(hashRunProblems(single, [honest])).toEqual([]);
    expect(hashRunProblems(single, [wrong])).toEqual([`wrong: run digest ${toHex(wrong.output.digest!)}, but Hash port "toy-a" gives ${toHex(hashWith('toy-a', utf8Bytes('abc')))}`]);
  });

  it('skips a case without an algorithm when the family has several functions', () => {
    expect(hashRunProblems(family, [{ name: 'ambiguous', params: { input: 'abc' }, output: { digest: [1, 2, 3, 4] }, message }])).toEqual([]);
  });
});

describe('hashRunProblems with a key param', () => {
  const message = [0x61];

  it('skips a keyed case (a MAC, not the unkeyed port function) but checks an empty key', () => {
    const keyed: HashRunCase = { name: 'keyed', params: { algorithm: 'toy-a', key: '000102' }, output: { digest: [1, 2, 3, 4] }, message };
    const unkeyed: HashRunCase = { name: 'unkeyed', params: { algorithm: 'toy-a', key: '' }, output: { digest: [1, 2, 3, 4] }, message };
    expect(hashRunProblems(family, [keyed])).toEqual([]);
    expect(hashRunProblems(family, [unkeyed])).toHaveLength(1);
  });
});

describe('hashRunProblems for XOFs', () => {
  /** Toy XOF: every output byte is the XOR of the data, N, S and the output index. */
  const toyXof: XofFunction = {
    id: 'toy-xof',
    blockSize: 8,
    securityBits: 64,
    customizable: true,
    xof: (data: Uint8Array, outputLength: number, custom?: XofCustomization) => {
      const fold = [...data, ...(custom?.functionName ?? []), ...(custom?.customization ?? [])].reduce((acc, byte) => acc ^ byte, 0);
      return Uint8Array.from({ length: outputLength }, (_, i) => fold ^ i);
    },
    create: () => {
      throw new Error('toy: hashRunProblems uses xof() only');
    },
  };
  const withXof: HashFamily = { ...family, xofs: [toyXof] };
  const message = [0x61, 0x62];
  const params = { algorithm: 'toy-xof', outputLength: '6', functionName: 'N', customization: 'Email' };
  const expected = toyXof.xof(Uint8Array.from(message), 6, { functionName: utf8Bytes('N'), customization: utf8Bytes('Email') });

  it('compares an XOF run with xof(message, outputLength, { functionName, customization })', () => {
    expect(hashRunProblems(withXof, [{ name: 'xof', params, output: { digest: Array.from(expected) }, message }])).toEqual([]);
  });

  it('reports an XOF run with the wrong output or length', () => {
    const short = Array.from(expected.slice(0, 4));
    expect(hashRunProblems(withXof, [{ name: 'short', params, output: { digest: short }, message }])).toEqual([`short: run digest ${toHex(short)}, but Hash port XOF "toy-xof" gives ${toHex(expected)}`]);
  });

  it('defaults to an empty customization and the run length when the params carry none', () => {
    const plain = toyXof.xof(Uint8Array.from(message), 3);
    expect(hashRunProblems(withXof, [{ name: 'plain', params: { algorithm: 'toy-xof' }, output: { digest: Array.from(plain) }, message }])).toEqual([]);
  });
});
