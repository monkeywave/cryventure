import {
  getFacet,
  hashFunction,
  parseHexToArray,
  stateAt,
  toHex,
  validateWordopsFacet,
  type AnyStateFacet,
  type RegionLayout,
  type TraceBundle,
  type ValuesFacet,
  type WordopsFacet,
  type WordopsStep,
} from '@cryventure/core';
import { describe, expect, it } from 'vitest';
import { blake2Hash } from '../_lib/blake2/hash.ts';
import type { Blake2Id } from '../_lib/blake2/manifestKit.ts';
import { BLAKE2_PRESETS, blake2Manifest, validateBlake2, type Blake2Params } from './manifest.ts';
import { ports, run } from './module.ts';
import de from './i18n/de.json';
import en from './i18n/en.json';
import vectors from './vectors/rfc7693-kat.json';

const ABC: Blake2Params = { algorithm: 'blake2s-256', encoding: 'utf8', input: 'abc', key: '', detail: 'g' };

function trace(params: Blake2Params): TraceBundle {
  const result = run(params);
  if (!result.ok) throw new Error(`run failed: ${result.error.key}`);
  return result.trace;
}
const state = (bundle: TraceBundle) => getFacet<AnyStateFacet>(bundle, 'state')!;
const wordops = (bundle: TraceBundle) => getFacet<WordopsFacet>(bundle, 'wordops')!;
const values = (bundle: TraceBundle) => getFacet<ValuesFacet>(bundle, 'values')!;
const ops = (bundle: TraceBundle) => state(bundle).steps.map((step) => step.op);
const presetParams = (id: string) => BLAKE2_PRESETS.find((preset) => preset.id === id)!.params;
const wordopsAt = (bundle: TraceBundle, step: number): WordopsStep => wordops(bundle).steps.find((entry) => entry.step === step)!;

/** RFC 7693 prints each word as the big-endian hex of its value, which is how the wordops facet writes it. */
const RFC = Object.fromEntries(vectors.rfc7693.map((example) => [example.algorithm, example])) as Record<'blake2s-256' | 'blake2b-512', (typeof vectors.rfc7693)[number]>;

describe('blake2 run: RFC 7693 Appendix A and B intermediate values', () => {
  it.each(['blake2s-256', 'blake2b-512'] as const)('%s "abc": m, v after load, v after every round (G detail) and the final h equal the RFC', (algorithm) => {
    const example = RFC[algorithm];
    const bundle = trace({ ...ABC, algorithm });
    const steps = ops(bundle);
    const load = wordopsAt(bundle, steps.indexOf('load'));
    expect(load.terms.filter((term) => /^m\d+$/.test(term.id)).map((term) => term.hex)).toEqual(example.m);
    const [initial, ...rounds] = example.v;
    expect(load.terms.find((term) => term.id === 'v14')!.hex).toBe(initial!.v[14]);
    const gSteps = steps.flatMap((op, index) => (op === 'g' ? [index] : []));
    expect(wordopsAt(bundle, gSteps[0]!).registers!.before).toEqual(initial!.v);
    rounds.forEach(({ i, v }) => expect(wordopsAt(bundle, gSteps[8 * i - 1]!).registers!.after, `after round ${i}`).toEqual(v));
    const feedForward = wordopsAt(bundle, steps.indexOf('feedForward'));
    expect(feedForward.terms.map((term) => term.hex)).toEqual(example.h);
    expect(toHex(bundle.output['digest']!)).toBe(example.md);
  });

  it('BLAKE2b-512 "abc" at round detail: one step per round, v after round i equals the RFC', () => {
    const bundle = trace(presetParams('blake2b-512-abc-round'));
    const roundSteps = ops(bundle).flatMap((op, index) => (op === 'round' ? [index] : []));
    expect(roundSteps).toHaveLength(12);
    RFC['blake2b-512'].v.slice(1).forEach(({ i, v }) => expect(wordopsAt(bundle, roundSteps[i - 1]!).registers!.after).toEqual(v));
  });

  it('the v region holds the RFC words little-endian after load', () => {
    const bundle = trace(ABC);
    const v = stateAt(state(bundle), ops(bundle).indexOf('load'))['v']!;
    const words = Array.from({ length: 16 }, (_, j) => toHex(v.slice(4 * j, 4 * j + 4).reverse()));
    expect(words).toEqual(RFC['blake2s-256'].v[0]!.v);
  });
});

/** RFC 7693 Appendix E: `selftest_seq`, a Fibonacci generator seeded with a = 0xDEAD4BAD · seed. */
function selftestSequence(length: number, seed: number): Uint8Array {
  let a = Math.imul(0xdead4bad, seed) >>> 0;
  let b = 1;
  return Uint8Array.from({ length }, () => {
    const t = (a + b) >>> 0;
    a = b;
    b = t;
    return t >>> 24;
  });
}

describe('blake2 Hash port: RFC 7693 Appendix E self-test', () => {
  it.each(vectors.selftest)('$algorithm grand hash over unkeyed (port) and keyed (lib) digests, accumulated in a port context', ({ algorithm, grandHashAlgorithm, mdLens, inLens, grandHash }) => {
    const family = ports.Hash;
    const grand = hashFunction(family, grandHashAlgorithm)!.create();
    for (const outlen of mdLens) {
      const id = `${algorithm}-${outlen * 8}` as Blake2Id;
      const fn = hashFunction(family, id)!;
      for (const inlen of inLens) {
        const input = selftestSequence(inlen, inlen);
        grand.update(fn.hash(input));
        grand.update(blake2Hash(id, input, selftestSequence(outlen, outlen)));
      }
    }
    expect(toHex(grand.digest())).toBe(grandHash);
  });
});

describe('blake2 lib: reference keyed KATs (blake2s-kat.txt, blake2b-kat.txt)', () => {
  it(`reproduces all ${vectors.kat.length} keyed digests with messages of at most 128 bytes`, () => {
    for (const { algorithm, msg, key, md } of vectors.kat) {
      expect(toHex(blake2Hash(algorithm as Blake2Id, Uint8Array.from(parseHexToArray(msg)), Uint8Array.from(parseHexToArray(key)))), `${algorithm} ${msg.length / 2}`).toBe(md);
    }
  });

  it('the traced run reproduces keyed KATs at every detail level', () => {
    for (const bytes of [0, 1, 63, 64, 65, 128]) {
      const kat = vectors.kat.find((entry) => entry.algorithm === 'blake2s-256' && entry.bytes === bytes)!;
      const detail = (['g', 'round', 'block'] as const)[bytes % 3]!;
      expect(toHex(trace({ algorithm: 'blake2s-256', encoding: 'hex', input: kat.msg, key: kat.key, detail }).output['digest']!), `${bytes} bytes`).toBe(kat.md);
    }
  });
});

describe('blake2 run: steps and scopes', () => {
  it.each([
    ['blake2s-256-abc', 84],
    ['blake2b-512-abc', 100],
    ['blake2s-256-empty', 84],
    ['blake2s-256-keyed', 166],
    ['blake2b-512-abc-round', 16],
  ])('preset %s has %i steps', (id, count) => {
    expect(state(trace(presetParams(id))).steps).toHaveLength(count);
  });

  it('records init, load, 8 G calls per round, feed-forward and output at G detail', () => {
    const steps = ops(trace(ABC));
    expect(steps.slice(0, 3)).toEqual(['init', 'load', 'g']);
    expect(steps.filter((op) => op === 'g')).toHaveLength(80);
    expect(steps.slice(-2)).toEqual(['feedForward', 'output']);
  });

  it('records one compress step per block at block detail', () => {
    expect(ops(trace({ ...ABC, detail: 'block' }))).toEqual(['init', 'load', 'compress', 'feedForward', 'output']);
  });

  it('scopes: block → round → op at G detail, with init/load/feedForward/output directly in their block', () => {
    const facet = state(trace(presetParams('blake2s-256-keyed')));
    expect(facet.scopeLevels!.map((level) => level.labelKey)).toEqual(['plugin.blake2.scope.block', 'plugin.blake2.scope.round', 'plugin.blake2.scope.op']);
    const scopes = facet.steps.map((step) => [step.op, step.scope.join('.')]);
    expect(scopes.slice(0, 4)).toEqual([['init', '0'], ['load', '0'], ['g', '0.0.0'], ['g', '0.0.1']]);
    expect(scopes.slice(80, 85)).toEqual([['g', '0.9.6'], ['g', '0.9.7'], ['feedForward', '0'], ['load', '1'], ['g', '1.0.0']]);
    expect(scopes.at(-1)).toEqual(['output', '1']);
  });

  it('scope levels follow the detail: block → round, and block alone', () => {
    expect(state(trace({ ...ABC, detail: 'round' })).scopeLevels).toHaveLength(2);
    expect(state(trace({ ...ABC, detail: 'round' })).steps[2]!.scope).toEqual([0, 0]);
    expect(state(trace({ ...ABC, detail: 'block' })).scopeLevels).toHaveLength(1);
  });

  it('a keyed run loads the key as block 0 with t = blockBytes and narrates it', () => {
    const bundle = trace(presetParams('blake2s-256-keyed'));
    const loads = state(bundle).steps.filter((step) => step.op === 'load');
    expect(loads.map((step) => step.narration.key)).toEqual(['plugin.blake2.step.loadKey', 'plugin.blake2.step.loadLast']);
    expect(loads[1]!.narration.params).toMatchObject({ t: 67, bytes: 3 });
    expect(state(bundle).initialNarration!.key).toBe('plugin.blake2.step.initialKeyed');
  });
});

describe('blake2 run: facets', () => {
  it('declares little-endian word regions; v is the 4 × 4 matrix', () => {
    const regions = state(trace(presetParams('blake2s-256-keyed'))).regions;
    expect(regions.map((region) => region.id)).toEqual(['message', 'key', 'm', 'h', 'v', 'digest']);
    const v = regions.find((region) => region.id === 'v')!;
    expect(v.layout).toEqual({ kind: 'words', wordBytes: 4, labelPrefix: 'v', wordsPerGroup: 4, byteOrder: 'little' } satisfies RegionLayout);
    expect(state(trace(presetParams('blake2s-256-empty'))).regions.map((region) => region.id)).toEqual(['m', 'h', 'v', 'digest']);
  });

  it.each(BLAKE2_PRESETS.map((preset) => [preset.id, preset.params] as const))('%s: wordops is a valid schema-v2 facet with the v0 … v15 grid', (_id, params) => {
    const bundle = trace(params);
    const facet = wordops(bundle);
    expect(validateWordopsFacet(facet, state(bundle).steps.length)).toEqual([]);
    expect([facet.schemaVersion, facet.registerColumns, facet.registerNames![15]]).toEqual([2, 4, 'v15']);
  });

  it('a G step: x, y, a′, d′, c′, b′, a″, d″, c″, b″; touched = its four registers; transfers write a″ … d″', () => {
    const bundle = trace(ABC);
    const steps = ops(bundle);
    const g5 = wordopsAt(bundle, steps.indexOf('g') + 5);
    expect(g5.terms.map((term) => term.id)).toEqual(['x', 'y', 'a1', 'd1', 'c1', 'b1', 'a2', 'd2', 'c2', 'b2']);
    expect(g5.terms.filter((term) => term.emphasis === 'story').map((term) => term.id)).toEqual(['a2', 'd2', 'c2', 'b2']);
    expect(g5.terms.map((term) => term.op ?? '-')).toEqual(['-', '-', 'add', 'rotr', 'add', 'rotr', 'add', 'rotr', 'add', 'rotr']);
    expect(g5.registers!.touched).toEqual([1, 6, 11, 12]);
    expect(g5.registers!.transfers).toEqual([
      { to: 1, from: { term: 'a2' } },
      { to: 6, from: { term: 'b2' } },
      { to: 11, from: { term: 'c2' } },
      { to: 12, from: { term: 'd2' } },
    ]);
    expect(g5.terms[3]!.label).toEqual({ key: 'plugin.blake2.term.d1', params: { a: 1, d: 12, r: 16 } });
  });

  it('init, load and feed-forward carry terms but no registers; output carries no wordops', () => {
    const bundle = trace(ABC);
    const steps = ops(bundle);
    for (const op of ['init', 'load', 'feedForward']) {
      const entry = wordopsAt(bundle, steps.indexOf(op));
      expect(entry.terms.length, op).toBeGreaterThan(0);
      expect(entry.registers, op).toBeUndefined();
    }
    expect(wordopsAt(bundle, steps.indexOf('output'))).toBeUndefined();
    expect(wordopsAt(bundle, steps.indexOf('init')).terms[0]!.hex).toBe('01010020');
  });

  it('values: message, key, IV, h/1 … h/N and the digest', () => {
    const facet = values(trace(presetParams('blake2s-256-keyed')));
    expect(facet.values.map((value) => [value.id, value.role])).toEqual([
      ['message', 'public'],
      ['key', 'key'],
      ['iv', 'constant'],
      ['h/1', 'public'],
      ['h/2', 'public'],
      ['digest', 'public'],
    ]);
    expect(toHex(facet.values[2]!.bytes.slice(0, 4))).toBe('67e6096a');
  });

  it('the digest is h little-endian, truncated to nn bytes', () => {
    const bundle = trace({ ...ABC, algorithm: 'blake2s-128' });
    expect(bundle.output['digest']).toHaveLength(16);
    expect(state(bundle).steps.at(-1)!.narration.key).toBe('plugin.blake2.step.outputTruncated');
  });
});

describe('blake2 manifest', () => {
  it('validates params with the per-variant key limit', () => {
    expect(validateBlake2({ ...ABC, key: '00'.repeat(33) })).toEqual({ ok: false, error: { key: 'plugin.blake2.error.keyLength', params: { length: 33, max: 32 } } });
    expect(validateBlake2({ ...ABC, algorithm: 'blake2b-512', key: '00'.repeat(33) }).ok).toBe(true);
    expect(run({ ...ABC, detail: 'op' } as unknown as Blake2Params)).toMatchObject({ ok: false });
  });

  it('implements Hash with the eight RFC 7693 functions', () => {
    expect(blake2Manifest.implements).toEqual(['Hash']);
    expect(ports.Hash.functions.map((fn) => fn.id)).toEqual(['blake2s-128', 'blake2s-160', 'blake2s-224', 'blake2s-256', 'blake2b-160', 'blake2b-256', 'blake2b-384', 'blake2b-512']);
  });

  it('EN and DE catalogs have the same keys', () => {
    expect(Object.keys(de).sort()).toEqual(Object.keys(en).sort());
  });
});
