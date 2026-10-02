import {
  getFacet,
  ginv,
  gmul,
  mathStepAt,
  toHex,
  unwrittenAt,
  validateMathFacet,
  xtime,
  type AnyStateFacet,
  type MathFacet,
  type NarrationFacet,
  type TraceBundle,
  type ValuesFacet,
} from '@cryventure/core';
import { describe, expect, it } from 'vitest';
import { GF256_PRESETS, gf256Manifest, readByteHex, validateGf256Params, type Gf256Op, type Gf256Params } from './manifest.ts';
import { run } from './module.ts';
import vectors from './vectors/fips197.json';

const NS = 'plugin.gf256';
const hex = (byte: number) => toHex([byte]);

function trace(params: Gf256Params): TraceBundle {
  const result = run(params);
  if (!result.ok) throw new Error(`run failed: ${result.error.key}`);
  return result.trace;
}

const resultOf = (params: Gf256Params) => trace(params).output['result']?.[0];
const state = (bundle: TraceBundle) => getFacet<AnyStateFacet>(bundle, 'state')!;
const math = (bundle: TraceBundle) => getFacet<MathFacet>(bundle, 'math')!;
const ops = (bundle: TraceBundle) => state(bundle).steps.map((step) => step.op);

describe('gf256 vectors (FIPS 197)', () => {
  it.each(vectors.cases)('$section', ({ op, aHex, bHex, resultHex }) => {
    expect(hex(resultOf({ op: op as Gf256Op, aHex, bHex })!)).toBe(resultHex);
  });

  it.each(GF256_PRESETS.map((preset) => [preset.id, preset.params] as const))('preset %s is a checked vector', (_id, params) => {
    const vector = vectors.cases.find((c) => c.op === params.op && c.aHex === params.aHex && (params.op !== 'gmul' || c.bHex === params.bHex));
    expect(vector).toBeDefined();
    expect(hex(resultOf(params)!)).toBe(vector!.resultHex);
  });
});

describe('gf256 run equals core arithmetic', () => {
  const bytes = Array.from({ length: 256 }, (_, byte) => byte);

  it('xtime and ginv for every byte', () => {
    for (const a of bytes) {
      expect(resultOf({ op: 'xtime', aHex: hex(a), bHex: '00' })).toBe(xtime(a));
      expect(resultOf({ op: 'ginv', aHex: hex(a), bHex: '00' })).toBe(ginv(a));
    }
  });

  it('gmul for every pair a, b', () => {
    const mismatches: string[] = [];
    for (const a of bytes)
      for (const b of bytes) if (resultOf({ op: 'gmul', aHex: hex(a), bHex: hex(b) }) !== gmul(a, b)) mismatches.push(`${hex(a)}•${hex(b)}`);
    expect(mismatches).toEqual([]);
  }, 60_000);
});

describe('gf256 trace structure', () => {
  it('xtime: load, shift, reduce in scopes [0], [1], [2]; math marks the carry and the modulus', () => {
    const bundle = trace({ op: 'xtime', aHex: 'ae', bHex: '00' });
    expect(ops(bundle)).toEqual(['load', 'shift', 'reduce']);
    expect(state(bundle).steps.map((step) => step.scope)).toEqual([[0], [1], [2]]);
    const reduce = math(bundle).steps[2]!;
    expect(reduce.terms.map((t) => [t.id, t.value, t.width])).toEqual([
      ['shifted', 0x15c, 9],
      ['carry', 1, 1],
      ['modulus', 0x11b, 9],
      ['result', 0x47, 8],
    ]);
    expect(math(bundle).notation).toEqual({ field: 'gf2^8', modulus: 0x11b });
  });

  it('xtime without carry has no modulus term', () => {
    const terms = math(trace({ op: 'xtime', aHex: '57', bHex: '00' })).steps[2]!.terms;
    expect(terms.map((t) => t.id)).toEqual(['shifted', 'carry', 'result']);
  });

  it('gmul: load, then [bit, part] scopes (xtime for bits ≥ 1, add or skip), then result', () => {
    const bundle = trace({ op: 'gmul', aHex: '57', bHex: '83' });
    expect(ops(bundle)).toEqual(['load', 'add', ...Array.from({ length: 7 }, (_, i) => ['xtime', i === 0 || i === 6 ? 'add' : 'skip']).flat(), 'result']);
    const scopes = state(bundle).steps.map((step) => step.scope);
    expect(scopes.slice(0, 4)).toEqual([[], [0, 0], [1, 0], [1, 1]]);
    expect(scopes.at(-1)).toEqual([]);
  });

  it('gmul narrates the FIPS 197 §4.2.1 xtime chain and each addition in hex', () => {
    const bundle = trace({ op: 'gmul', aHex: '57', bHex: '13' });
    const narration = getFacet<NarrationFacet>(bundle, 'narration')!.entries.map((entry) => entry.ref);
    expect(narration).toContainEqual({ key: `${NS}.step.gmul.xtimeReduce`, params: { bit: 2, previous: '{ae}', addend: '{47}' } });
    expect(narration).toContainEqual({ key: `${NS}.step.gmul.add`, params: { bit: 4, addend: '{07}', acc: '{fe}' } });
    expect(narration.at(-1)).toEqual({ key: `${NS}.step.gmul.result`, params: { a: '{57}', b: '{13}', result: '{fe}' } });
  });

  it('ginv: 7 squares and 6 multiplies, one scope per exponent bit 6…0, ending in a²⁵⁴', () => {
    const bundle = trace({ op: 'ginv', aHex: '53', bHex: '00' });
    const steps = state(bundle).steps;
    expect(steps.filter((step) => step.op === 'square')).toHaveLength(7);
    expect(steps.filter((step) => step.op === 'multiply')).toHaveLength(6);
    const bits = steps.filter((step) => step.scope.length > 0).map((step) => step.scope[0]);
    expect([...new Set(bits)]).toEqual([6, 5, 4, 3, 2, 1, 0]);
    expect(steps.filter((step) => step.op === 'multiply').map((step) => step.scope[0])).toEqual([6, 5, 4, 3, 2, 1]);
    expect(state(bundle).scopeLevels?.[0]).toEqual({ labelKey: `${NS}.scope.exponentBit`, nextKey: `${NS}.scope.exponentBitNext`, prevKey: `${NS}.scope.exponentBitPrev` });
    const lastPower = math(bundle).steps.at(-2)!.terms.at(-1)!;
    expect(lastPower).toMatchObject({ value: 0xca, role: 'result', label: { params: { exponent: 254 } } });
  });

  it('ginv of {00} skips the all-zero powers and narrates the convention (like aes-sbox)', () => {
    const bundle = trace({ op: 'ginv', aHex: '00', bHex: '00' });
    expect(state(bundle).steps.map((step) => step.op)).toEqual(['load', 'result']);
    const narration = getFacet<NarrationFacet>(bundle, 'narration')!.entries.map((entry) => entry.ref);
    expect(narration).toEqual([{ key: `${NS}.step.ginv.loadZero`, params: { a: '{00}' } }, { key: `${NS}.step.ginv.resultZero` }]);
  });

  it.each(GF256_PRESETS.map((preset) => [preset.id, preset.params] as const))('%s: one valid math step per state step', (_id, params) => {
    const bundle = trace(params);
    expect(validateMathFacet(math(bundle))).toEqual([]);
    expect(math(bundle).steps.map((step) => step.step)).toEqual(state(bundle).steps.map((_, index) => index));
    expect(mathStepAt(math(bundle), state(bundle).steps.length - 1)?.terms.some((t) => t.op === 'result')).toBe(true);
  });

  it('lists b as a value only for gmul', () => {
    const names = (params: Gf256Params) => getFacet<ValuesFacet>(trace(params), 'values')!.values.map((value) => value.labelKey);
    expect(names({ op: 'gmul', aHex: '57', bHex: '83' })).toEqual([`${NS}.value.a`, `${NS}.value.b`, `${NS}.value.result`]);
    expect(names({ op: 'xtime', aHex: '57', bHex: '83' })).toEqual([`${NS}.value.a`, `${NS}.value.result`]);
  });
});

describe('validateGf256Params', () => {
  it('normalises hex', () => {
    expect(validateGf256Params({ op: 'gmul', aHex: 'AB', bHex: ' 0c ' })).toEqual({ ok: true, value: { op: 'gmul', aHex: 'ab', bHex: '0c' } });
  });

  it.each([
    [null, { key: `${NS}.error.invalidParams` }],
    [{ op: 'pow', aHex: '01', bHex: '01' }, { key: `${NS}.error.op`, params: { op: 'pow' } }],
    [{ op: 'gmul', aHex: '0102', bHex: '01' }, { key: `${NS}.error.aLength`, params: { length: 2 } }],
    [{ op: 'gmul', aHex: '01', bHex: '' }, { key: `${NS}.error.bLength`, params: { length: 0 } }],
  ])('rejects %j', (params, error) => {
    expect(validateGf256Params(params)).toEqual({ ok: false, error });
  });

  it('run returns the validation error', () => {
    expect(run({ op: 'xtime', aHex: 'zz', bHex: '00' }).ok).toBe(false);
  });
});

describe('readByteHex', () => {
  it('reports hex errors and wrong lengths', () => {
    expect(readByteHex('zz', 'k')).toEqual({ ok: false, error: { key: 'core.error.hexInvalidChar', params: { char: 'z', index: 0 } } });
    expect(readByteHex('0000', 'k')).toEqual({ ok: false, error: { key: 'k', params: { length: 2 } } });
  });
});

describe('gf256Manifest', () => {
  it('lazily loads a module with run()', async () => {
    expect(typeof (await gf256Manifest.load()).run).toBe('function');
  });
});

describe('gf256 blank regions', () => {
  it('declares every one-byte region blank until a step writes it', () => {
    const facet = state(trace({ op: 'gmul', aHex: '57', bHex: '83' }));
    expect(facet.regions.every((region) => region.initial === 'blank')).toBe(true);
    expect([...unwrittenAt(facet, -1).values()].every((indices) => indices.size === 1)).toBe(true);
  });
});
