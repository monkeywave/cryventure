import { getFacet, hashFunction, parseHexToArray, stateAt, toHex, validateWordopsFacet, type AnyStateFacet, type TraceBundle, type ValuesFacet, type WordopsFacet } from '@cryventure/core';
import { describe, expect, it } from 'vitest';
import { cloneProblems, hmacMemberFor, namedVectors, patternBytes, splitUpdateProblems, vectorTagHex } from '../_lib/hmac/macPortTestKit.ts';
import { SHA1_OP_NAMES } from '../_lib/legacy-md/manifestKit.ts';
import { sha1Manifest, SHA1_PRESETS, validateSha1Params, type Sha1Params } from './manifest.ts';
import { ports, run } from './module.ts';
import de from './i18n/de.json';
import en from './i18n/en.json';
import cavp from './vectors/cavp-shortmsg.json';
import intermediate from './vectors/nist-intermediate-abc.json';
import rfc2202 from '../_lib/hmac/vectors/rfc2202.json';

const ABC: Sha1Params = { encoding: 'utf8', input: 'abc', detail: 'round' };
const TWO_BLOCK = 'abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq';

function trace(params: Sha1Params): TraceBundle {
  const result = run(params);
  if (!result.ok) throw new Error(`run failed: ${result.error.key}`);
  return result.trace;
}
const state = (bundle: TraceBundle) => getFacet<AnyStateFacet>(bundle, 'state')!;
const wordops = (bundle: TraceBundle) => getFacet<WordopsFacet>(bundle, 'wordops')!;
const ops = (bundle: TraceBundle) => state(bundle).steps.map((step) => step.op);
const words = (bytes: readonly number[]) => (toHex(bytes).match(/.{8}/g) ?? []) as string[];
const formulaSteps = (bundle: TraceBundle, op: string) => wordops(bundle).steps.filter((step) => step.formula.key === `plugin.sha1.formula.${op}`);

describe('sha1 run: NIST intermediate values for "abc" (SHA1.pdf)', () => {
  it('a … e after rounds 0, 19, 79 equal the NIST rows, in the wordops registers and in the state', () => {
    const bundle = trace(ABC);
    const rounds = formulaSteps(bundle, 'round');
    for (const [t, row] of Object.entries(intermediate.vars)) {
      const step = rounds[Number(t)]!;
      expect(step.formula.params?.['t']).toBe(Number(t));
      expect(step.registers?.after, `t = ${t}`).toEqual(row);
      expect(words(stateAt(state(bundle), step.step)['vars']!), `vars at t = ${t}`).toEqual(row);
    }
    expect(toHex(bundle.output['digest']!)).toBe(intermediate.digest);
  });
});

describe('sha1 run: steps, scope and facets', () => {
  it('records pad, init, 16 rounds, then schedule t / round t for t = 16 … 79, feed-forward and output', () => {
    const steps = ops(trace(ABC));
    expect(steps.length).toBe(148);
    expect(steps.slice(0, 3)).toEqual(['pad', 'init', 'round']);
    expect(steps.slice(17, 21)).toEqual(['round', 'schedule', 'round', 'schedule']);
    expect(steps.slice(-2)).toEqual(['feedForward', 'output']);
  });

  it.each([
    ['abc', 'round', 148],
    ['abc', 'block', 5],
    ['', 'round', 148],
    [TWO_BLOCK, 'round', 294],
    [TWO_BLOCK, 'block', 8],
  ] as const)('%j at %s detail has %i steps', (input, detail, count) => {
    expect(state(trace({ ...ABC, input, detail })).steps.length).toBe(count);
  });

  it('scopes steps as block → op, with pad in block 1 and output in the last block', () => {
    const steps = state(trace({ ...ABC, input: TWO_BLOCK })).steps;
    expect(steps[0]!.scope).toEqual([0, 0]);
    expect(steps[147]!.op).toBe('init');
    expect(steps[147]!.scope).toEqual([1, 0]);
    expect(steps.at(-1)!.scope).toEqual([1, 146]);
  });

  it('records only the ops the manifest declares', () => {
    expect(Object.keys(sha1Manifest.ops!)).toEqual([...SHA1_OP_NAMES]);
    const used = new Set([...ops(trace(ABC)), ...ops(trace({ ...ABC, detail: 'block' }))]);
    expect([...used].every((op) => Object.hasOwn(sha1Manifest.ops!, op))).toBe(true);
  });

  it('has big-endian word regions, including the 80-word schedule', () => {
    const regions = state(trace(ABC)).regions;
    expect(regions.map((region) => [region.id, region.shape[0]])).toEqual([['message', 3], ['padded', 64], ['w', 320], ['vars', 20], ['h', 20], ['digest', 20]]);
    for (const region of regions.slice(1)) expect(region.layout).toEqual(expect.objectContaining({ kind: 'words', wordBytes: 4 }));
    expect(regions.some((region) => region.layout?.kind === 'words' && region.layout.byteOrder === 'little')).toBe(false);
  });

  it('leaves W16 … W79 of block 1 in place at the init of block 2', () => {
    const bundle = trace({ ...ABC, input: TWO_BLOCK });
    const steps = state(bundle).steps;
    const init2 = steps.findLastIndex((step) => step.op === 'init');
    const block1W = words(stateAt(state(bundle), init2 - 1)['w']!);
    const atInit2 = words(stateAt(state(bundle), init2)['w']!);
    expect(atInit2.slice(16)).toEqual(block1W.slice(16));
    expect(atInit2.slice(0, 16)).not.toEqual(block1W.slice(0, 16));
  });
});

describe('sha1 run: wordops v2', () => {
  it('emits a valid schema-v2 wordops facet with 32-bit words and registers a … e', () => {
    for (const detail of ['round', 'block'] as const) {
      const bundle = trace({ ...ABC, input: TWO_BLOCK, detail });
      expect(validateWordopsFacet(wordops(bundle), state(bundle).steps.length)).toEqual([]);
      expect(wordops(bundle)).toMatchObject({ schemaVersion: 2, wordBits: 32, registerNames: ['a', 'b', 'c', 'd', 'e'] });
    }
  });

  it('gives round t the terms ROTL⁵(a), f_t, e, K_t, W_t, T and ROTL³⁰(b), with T the story term', () => {
    const [first] = formulaSteps(trace(ABC), 'round');
    expect(first!.terms.map((term) => term.id)).toEqual(['rotl5', 'f', 'e', 'k', 'w', 'T', 'rotl30']);
    expect(first!.terms.filter((term) => term.emphasis === 'story').map((term) => term.id)).toEqual(['T']);
    expect(first!.terms.find((term) => term.id === 'T')?.hex).toBe('0116fc33');
    expect(first!.terms.find((term) => term.id === 'k')?.hex).toBe('5a827999');
  });

  it('uses Ch, Parity, Maj, Parity for f_t in the four quarters', () => {
    const rounds = formulaSteps(trace(ABC), 'round');
    expect([0, 20, 40, 60].map((t) => rounds[t]!.terms[1]!.op)).toEqual(['ch', 'parity', 'maj', 'parity']);
  });

  it('transfers e ← d, d ← c, c ← ROTL³⁰(b), b ← a, a ← T', () => {
    const step = formulaSteps(trace(ABC), 'round')[30]!;
    expect(step.registers?.transfers).toEqual([
      { to: 0, from: { term: 'T' } },
      { to: 1, from: { register: 0 } },
      { to: 2, from: { term: 'rotl30' } },
      { to: 3, from: { register: 2 } },
      { to: 4, from: { register: 3 } },
    ]);
  });

  it('gives schedule t the four words, their XOR and W_t', () => {
    const [first] = formulaSteps(trace(ABC), 'schedule');
    expect(first!.terms.map((term) => term.id)).toEqual(['w3', 'w8', 'w14', 'w16', 'xor', 'w']);
    expect(first!.terms.find((term) => term.id === 'w')?.hex).toBe('c2c4c700');
  });
});

describe('sha1 run: values', () => {
  it('has message, iv, h/<n> and digest values; the chaining values link from the wordops terms', () => {
    const bundle = trace({ ...ABC, input: TWO_BLOCK });
    const values = getFacet<ValuesFacet>(bundle, 'values')!.values;
    expect(values.map((value) => value.id)).toEqual(['message', 'iv', 'h/1', 'h/2', 'digest']);
    expect(toHex(values[1]!.bytes)).toBe('67452301efcdab8998badcfe10325476c3d2e1f0');
    const refs = new Set(wordops(bundle).steps.flatMap((step) => step.terms.flatMap((term) => (term.valueRef === undefined ? [] : [term.valueRef]))));
    expect([...refs].sort()).toEqual(['h/1', 'h/2', 'iv']);
  });
});

describe('sha1 validate', () => {
  it('has the presets of docs/M6.md §2e, sha1-abc first (the default), all valid', () => {
    expect(SHA1_PRESETS.map((preset) => preset.id)).toEqual(['sha1-abc', 'sha1-two-block', 'sha1-empty']);
    expect(sha1Manifest.defaults).toEqual(ABC);
    for (const preset of SHA1_PRESETS) expect(validateSha1Params(preset.params).ok).toBe(true);
  });

  it.each([
    [{ ...ABC, encoding: 'hex', input: '00'.repeat(321) }, 'plugin.sha1.error.inputLength'],
    [{ ...ABC, detail: 'op' }, 'plugin.sha1.error.detail'],
    [null, 'plugin.sha1.error.invalidParams'],
  ])('rejects %j with %s', (params, key) => {
    const result = validateSha1Params(params);
    expect(result.ok ? undefined : result.error.key).toBe(key);
  });
});

describe('sha1 catalogs', () => {
  it('names the one-bit rotation that SHA-0 lacked, in EN and DE', () => {
    expect(en['plugin.sha1.step.schedule']).toContain('SHA-0');
    expect(de['plugin.sha1.step.schedule']).toContain('SHA-0');
  });
});

describe('sha1 against NIST CAVP SHAVS SHA1ShortMsg (every case)', () => {
  it('holds the recorded number of cases', () => {
    expect(cavp.cases.length).toBe(cavp.files['sha-1'].cases);
    expect(Math.max(...cavp.cases.map((testCase) => testCase.bytes))).toBeLessThanOrEqual(128);
  });

  it.each(cavp.cases.map((testCase) => [testCase.bytes, testCase]))('%i bytes: run(), ports.Hash and a context', (_bytes, testCase) => {
    const message = Uint8Array.from(parseHexToArray(testCase.msg));
    expect(toHex(trace({ encoding: 'hex', input: testCase.msg, detail: 'block' }).output['digest']!)).toBe(testCase.md);
    const fn = hashFunction(ports.Hash, 'sha-1')!;
    expect(toHex(fn.hash(message))).toBe(testCase.md);
    const context = fn.create();
    context.update(message.subarray(0, 1));
    context.update(message.subarray(1));
    expect(toHex(context.digest())).toBe(testCase.md);
  });
});

describe('sha1 Mac port: RFC 2202 test cases 1–7', () => {
  it('offers HMAC over each Hash member, naming it in the construction', () => {
    expect(ports.Mac.functions.map((fn) => [fn.id, fn.construction])).toEqual([
      ['hmac-sha-1', { kind: 'hmac', hash: 'sha1:sha-1' }],
    ]);
  });

  it.each(namedVectors(rfc2202.cases.filter((vector) => vector.hash === 'sha1')))('%s through ports.Mac', (_, vector) => {
    expect(vectorTagHex(hmacMemberFor(ports.Mac, vector.hash), vector)).toBe(vector.tag);
  });

  it.each(ports.Mac.functions.map((fn) => [fn.id, fn] as const))('%s contexts: split updates and clones agree with mac (long key)', (_, fn) => {
    const key = patternBytes(fn.blockSize + 1, 7);
    expect([...splitUpdateProblems(fn, key, patternBytes(2 * fn.blockSize + 3, 3)), ...cloneProblems(fn, key, patternBytes(fn.blockSize + 1, 4))]).toEqual([]);
  });
});
