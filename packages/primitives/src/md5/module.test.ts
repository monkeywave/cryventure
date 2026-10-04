import { getFacet, hashFunction, stateAt, toHex, utf8Bytes, validateWordopsFacet, type AnyStateFacet, type TraceBundle, type ValuesFacet, type WordopsFacet } from '@cryventure/core';
import { describe, expect, it } from 'vitest';
import { cloneProblems, hmacMemberFor, namedVectors, patternBytes, splitUpdateProblems, vectorTagHex } from '../_lib/hmac/macPortTestKit.ts';
import { hashMessageBytes } from '../_lib/hashKit/manifestKit.ts';
import { MD5_OP_NAMES } from '../_lib/legacy-md/manifestKit.ts';
import { MD5_T } from '../_lib/legacy-md/md5.ts';
import { md5Manifest, MD5_PRESETS, validateMd5Params, type Md5Params } from './manifest.ts';
import { ports, run } from './module.ts';
import de from './i18n/de.json';
import en from './i18n/en.json';
import conformance from './vectors/conformance.json';
import rfcT from './vectors/rfc1321-t.json';
import rfc2202 from '../_lib/hmac/vectors/rfc2202.json';

const ABC: Md5Params = { encoding: 'utf8', input: 'abc', detail: 'round' };
const DIGITS = '12345678901234567890123456789012345678901234567890123456789012345678901234567890';

function trace(params: Md5Params): TraceBundle {
  const result = run(params);
  if (!result.ok) throw new Error(`run failed: ${result.error.key}`);
  return result.trace;
}
const state = (bundle: TraceBundle) => getFacet<AnyStateFacet>(bundle, 'state')!;
const wordops = (bundle: TraceBundle) => getFacet<WordopsFacet>(bundle, 'wordops')!;
const ops = (bundle: TraceBundle) => state(bundle).steps.map((step) => step.op);
const roundSteps = (bundle: TraceBundle) => wordops(bundle).steps.filter((step) => step.formula.key === 'plugin.md5.formula.round');

describe('md5 constants against RFC 1321', () => {
  it('the lib T table equals the RFC 1321 table (md5c.c)', () => {
    expect(MD5_T.map((word) => word.toString(16).padStart(8, '0'))).toEqual(rfcT.t);
  });
});

describe('md5 run: steps, scope and facets', () => {
  it('records pad, init, 64 operations, feed-forward and output', () => {
    const steps = ops(trace(ABC));
    expect(steps.length).toBe(68);
    expect(steps.slice(0, 3)).toEqual(['pad', 'init', 'round']);
    expect(steps.slice(-2)).toEqual(['feedForward', 'output']);
  });

  it.each([
    ['abc', 'round', 68],
    ['abc', 'block', 5],
    ['', 'round', 68],
    [DIGITS, 'round', 134],
    [DIGITS, 'block', 8],
  ] as const)('%j at %s detail has %i steps', (input, detail, count) => {
    expect(state(trace({ ...ABC, input, detail })).steps.length).toBe(count);
  });

  it('scopes steps as block → op, with pad in block 1 and output in the last block', () => {
    const steps = state(trace({ ...ABC, input: DIGITS })).steps;
    expect(steps[0]!.scope).toEqual([0, 0]);
    expect(steps[67]!.op).toBe('init');
    expect(steps[67]!.scope).toEqual([1, 0]);
    expect(steps.at(-1)!.scope).toEqual([1, 66]);
  });

  it('records only the ops the manifest declares (no schedule)', () => {
    expect(Object.keys(md5Manifest.ops!)).toEqual([...MD5_OP_NAMES]);
    const used = new Set([...ops(trace(ABC)), ...ops(trace({ ...ABC, detail: 'block' }))]);
    expect([...used].sort()).toEqual(['compress', 'feedForward', 'init', 'output', 'pad', 'round']);
  });

  it('declares little-endian words for padded, vars, h and digest and has no schedule region', () => {
    const regions = state(trace(ABC)).regions;
    expect(regions.map((region) => region.id)).toEqual(['message', 'padded', 'vars', 'h', 'digest']);
    for (const region of regions.slice(1)) expect(region.layout).toMatchObject({ kind: 'words', wordBytes: 4, byteOrder: 'little' });
  });

  it('stores the registers little-endian: H after the last block is the digest', () => {
    const bundle = trace(ABC);
    const final = stateAt(state(bundle), state(bundle).steps.length - 1);
    expect(toHex(final['h']!)).toBe('900150983cd24fb0d6963f7d28e17f72');
    expect(toHex(final['digest']!)).toBe('900150983cd24fb0d6963f7d28e17f72');
  });
});

describe('md5 run: wordops v2', () => {
  it('emits a valid schema-v2 wordops facet with 32-bit words and registers a … d', () => {
    for (const detail of ['round', 'block'] as const) {
      const bundle = trace({ ...ABC, input: DIGITS, detail });
      expect(validateWordopsFacet(wordops(bundle), state(bundle).steps.length)).toEqual([]);
      expect(wordops(bundle)).toMatchObject({ schemaVersion: 2, wordBits: 32, registerNames: ['a', 'b', 'c', 'd'] });
    }
  });

  it('gives operation i the terms f, X[k], T[i], the sum, the rotation and the new b (story)', () => {
    const [first] = roundSteps(trace(ABC));
    expect(first!.terms.map((term) => term.id)).toEqual(['f', 'x', 't', 'sum', 'rotl', 'newB']);
    expect(first!.terms.map((term) => term.op)).toEqual(['ch', undefined, undefined, 'add', 'rotl', 'add']);
    expect(first!.terms.filter((term) => term.emphasis === 'story').map((term) => term.id)).toEqual(['newB']);
    expect(first!.terms.find((term) => term.id === 'x')?.hex).toBe('80636261');
    expect(first!.terms.find((term) => term.id === 't')?.hex).toBe('d76aa478');
    expect(first!.registers?.before).toEqual(['67452301', 'efcdab89', '98badcfe', '10325476']);
  });

  it('uses F, G, H, I as ch, md5G, parity, md5I in rounds 1 … 4', () => {
    const rounds = roundSteps(trace(ABC));
    expect([0, 16, 32, 48].map((i) => rounds[i]!.terms[0]!.op)).toEqual(['ch', 'md5G', 'parity', 'md5I']);
  });

  it('moves the registers a ← d, b ← new b, c ← b, d ← c', () => {
    const step = roundSteps(trace(ABC))[5]!;
    const { before, after, transfers } = step.registers!;
    expect(transfers).toEqual([
      { to: 0, from: { register: 3 } },
      { to: 1, from: { term: 'newB' } },
      { to: 2, from: { register: 1 } },
      { to: 3, from: { register: 2 } },
    ]);
    expect(after).toEqual([before[3], step.terms.at(-1)!.hex, before[1], before[2]]);
  });
});

describe('md5 run: values and narration', () => {
  it('has message, iv, h/<n> and digest values; the chaining values link from the wordops terms', () => {
    const bundle = trace({ ...ABC, input: DIGITS });
    const values = getFacet<ValuesFacet>(bundle, 'values')!.values;
    expect(values.map((value) => [value.id, value.role])).toEqual([
      ['message', 'public'],
      ['iv', 'constant'],
      ['h/1', 'public'],
      ['h/2', 'public'],
      ['digest', 'public'],
    ]);
    expect(toHex(values[1]!.bytes)).toBe('0123456789abcdeffedcba9876543210');
    const refs = new Set(wordops(bundle).steps.flatMap((step) => step.terms.flatMap((term) => (term.valueRef === undefined ? [] : [term.valueRef]))));
    expect([...refs].sort()).toEqual(['h/1', 'h/2', 'iv']);
  });

  it('omits the message region and value for the empty message', () => {
    const bundle = trace({ ...ABC, input: '' });
    expect(state(bundle).regions.map((region) => region.id)).toEqual(['padded', 'vars', 'h', 'digest']);
    expect(getFacet<ValuesFacet>(bundle, 'values')!.values.map((value) => value.id)).toEqual(['iv', 'h/1', 'digest']);
  });

  it('narrates operation 1 with F, X[0], T[1] and the shift 7', () => {
    const narration = state(trace(ABC)).steps[2]!.narration;
    expect(narration.key).toBe('plugin.md5.step.round');
    expect(narration.params).toMatchObject({ i: 1, round: 1, fn: 'F', k: 0, s: 7, T: 'd76aa478', x: '80636261' });
  });

  it('says little-endian in the padding narration, in EN and DE', () => {
    expect(en['plugin.md5.step.pad_other']).toContain('little-endian');
    expect(de['plugin.md5.step.pad_other']).toContain('Little-Endian');
  });
});

describe('md5 validate', () => {
  it('accepts every preset and normalises hex', () => {
    for (const preset of MD5_PRESETS) expect(validateMd5Params(preset.params).ok).toBe(true);
    expect(validateMd5Params({ ...ABC, encoding: 'hex', input: '61 62 63' })).toEqual({ ok: true, value: { ...ABC, encoding: 'hex', input: '616263' } });
  });

  it('has the presets of docs/M6.md §2e, md5-abc first (the default)', () => {
    expect(MD5_PRESETS.map((preset) => preset.id)).toEqual(['md5-abc', 'md5-empty', 'md5-digits']);
    expect(md5Manifest.defaults).toEqual(ABC);
    expect(utf8Bytes(MD5_PRESETS[2]!.params.input).length).toBe(80);
  });

  it.each([
    [{ ...ABC, encoding: 'hex', input: '616' }, 'core.error.hexOddLength'],
    [{ ...ABC, input: 'x'.repeat(129) }, 'plugin.md5.error.inputLength'],
    [{ ...ABC, encoding: 'base64' }, 'plugin.md5.error.encoding'],
    [{ ...ABC, detail: 'bit' }, 'plugin.md5.error.detail'],
    [{ ...ABC, input: 42 }, 'plugin.md5.error.invalidParams'],
  ])('rejects %j with %s', (params, key) => {
    const result = validateMd5Params(params);
    expect(result.ok ? undefined : result.error.key).toBe(key);
  });
});

describe('md5 port', () => {
  it('exposes family md5 with the function md5, agreeing with the RFC 1321 suite', () => {
    expect(ports.Hash.id).toBe('md5');
    const fn = hashFunction(ports.Hash, 'md5')!;
    for (const testCase of conformance.cases) {
      const message = Uint8Array.from(hashMessageBytes(testCase.params.encoding as Md5Params['encoding'], testCase.params.input));
      const context = fn.create();
      context.update(message);
      expect(toHex(fn.hash(message))).toBe(testCase.outputs.digest);
      expect(toHex(context.digest())).toBe(testCase.outputs.digest);
    }
  });
});

describe('md5 Mac port: RFC 2202 test cases 1–7', () => {
  it('offers HMAC over each Hash member, naming it in the construction', () => {
    expect(ports.Mac.functions.map((fn) => [fn.id, fn.construction])).toEqual([
      ['hmac-md5', { kind: 'hmac', hash: 'md5:md5' }],
    ]);
  });

  it.each(namedVectors(rfc2202.cases.filter((vector) => vector.hash === 'md5')))('%s through ports.Mac', (_, vector) => {
    expect(vectorTagHex(hmacMemberFor(ports.Mac, vector.hash), vector)).toBe(vector.tag);
  });

  it.each(ports.Mac.functions.map((fn) => [fn.id, fn] as const))('%s contexts: split updates and clones agree with mac (long key)', (_, fn) => {
    const key = patternBytes(fn.blockSize + 1, 7);
    expect([...splitUpdateProblems(fn, key, patternBytes(2 * fn.blockSize + 3, 3)), ...cloneProblems(fn, key, patternBytes(fn.blockSize + 1, 4))]).toEqual([]);
  });
});
