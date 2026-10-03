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
import fc from 'fast-check';
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

  // Exhaustively, gmulSteps = gmul for all 65,536 pairs (core); here run() on edge pairs and a sample.
  it('gmul for every pair of edge bytes', () => {
    const edges = [0x00, 0x01, 0x02, 0x1b, 0x57, 0x80, 0x83, 0xff];
    for (const a of edges) for (const b of edges) expect(resultOf({ op: 'gmul', aHex: hex(a), bHex: hex(b) }), `${hex(a)}•${hex(b)}`).toBe(gmul(a, b));
  });

  it('gmul for sampled pairs a, b', () => {
    const byte = fc.integer({ min: 0, max: 0xff });
    fc.assert(
      fc.property(byte, byte, (a, b) => resultOf({ op: 'gmul', aHex: hex(a), bHex: hex(b) }) === gmul(a, b)),
      { numRuns: 256 },
    );
  });
});

describe('gf256 trace structure', () => {
  it('xtime: a in the initial state, then shift, reduce in scopes [0], [1]; math marks the carry and the modulus', () => {
    const bundle = trace({ op: 'xtime', aHex: 'ae', bHex: '00' });
    expect(ops(bundle)).toEqual(['shift', 'reduce']);
    expect(state(bundle).initial['a']).toEqual([0xae]);
    expect(state(bundle).initialNarration).toEqual({ key: `${NS}.step.xtime.load`, params: { a: '{ae}' } });
    expect(state(bundle).steps.map((step) => step.scope)).toEqual([[0], [1]]);
    expect(mathStepAt(math(bundle), -1)?.formula).toEqual({ key: `${NS}.formula.xtimeLoad` });
    const reduce = mathStepAt(math(bundle), 1)!;
    expect(reduce.terms.map((t) => [t.id, t.value, t.width])).toEqual([
      ['shifted', 0x15c, 9],
      ['carry', 1, 1],
      ['modulus', 0x11b, 9],
      ['result', 0x47, 8],
    ]);
    expect(math(bundle).notation).toEqual({ field: 'gf2^8', modulus: 0x11b });
  });

  it('marks the carried-out bit 8 on shifted terms only (never on the modulus)', () => {
    const carried = (bundle: TraceBundle) => math(bundle).steps.flatMap((step) => step.terms.filter((t) => t.carryBit !== undefined).map((t) => [t.id, t.op, t.carryBit]));
    expect(carried(trace({ op: 'xtime', aHex: 'ae', bHex: '00' }))).toEqual([['shifted', 'shift', 8]]);
    expect(carried(trace({ op: 'gmul', aHex: '57', bHex: '13' }))).toEqual(new Array(7).fill(['shifted', 'shift', 8]));
  });

  it('xtime without carry has no modulus term', () => {
    const terms = mathStepAt(math(trace({ op: 'xtime', aHex: '57', bHex: '00' })), 1)!.terms;
    expect(terms.map((t) => t.id)).toEqual(['shifted', 'carry', 'result']);
  });

  it('gmul: a, b, a • x⁰ and acc = {00} in the initial state, then [bit, part] scopes (xtime for bits ≥ 1, add or skip), then result', () => {
    const bundle = trace({ op: 'gmul', aHex: '57', bHex: '83' });
    expect(ops(bundle)).toEqual(['add', ...Array.from({ length: 7 }, (_, i) => ['xtime', i === 0 || i === 6 ? 'add' : 'skip']).flat(), 'result']);
    expect(state(bundle).initial).toEqual({ a: [0x57], b: [0x83], addend: [0x57], acc: [0] });
    expect(state(bundle).initialNarration).toEqual({ key: `${NS}.step.gmul.load`, params: { a: '{57}', b: '{83}' } });
    const scopes = state(bundle).steps.map((step) => step.scope);
    expect(scopes.slice(0, 3)).toEqual([[0, 0], [1, 0], [1, 1]]);
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
    expect(state(bundle).steps.map((step) => step.op)).toEqual(['result']);
    const narration = getFacet<NarrationFacet>(bundle, 'narration')!.entries;
    expect(narration).toEqual([
      { step: -1, ref: { key: `${NS}.step.ginv.loadZero`, params: { a: '{00}' } } },
      { step: 0, ref: { key: `${NS}.step.ginv.resultZero` } },
    ]);
  });

  it.each(GF256_PRESETS.map((preset) => [preset.id, preset.params] as const))('%s: one valid math step for the initial state and per state step', (_id, params) => {
    const bundle = trace(params);
    expect(validateMathFacet(math(bundle))).toEqual([]);
    expect(math(bundle).steps.map((step) => step.step)).toEqual([-1, ...state(bundle).steps.map((_, index) => index)]);
    expect(getFacet<NarrationFacet>(bundle, 'narration')!.entries[0]?.step).toBe(-1);
    expect(mathStepAt(math(bundle), state(bundle).steps.length - 1)?.terms.some((t) => t.op === 'result')).toBe(true);
  });

  it('lists b as a value only for gmul; the operands exist from the initial state on', () => {
    const values = (params: Gf256Params) => getFacet<ValuesFacet>(trace(params), 'values')!.values;
    const names = (params: Gf256Params) => values(params).map((value) => value.labelKey);
    expect(names({ op: 'gmul', aHex: '57', bHex: '83' })).toEqual([`${NS}.value.a`, `${NS}.value.b`, `${NS}.value.result`]);
    expect(values({ op: 'gmul', aHex: '57', bHex: '83' }).map((value) => value.createdAt)).toEqual([-1, -1, 15]);
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
  it('declares only the regions without an initial value blank until a step writes them', () => {
    const blankIds = (params: Gf256Params) => state(trace(params)).regions.filter((region) => region.initial === 'blank').map((region) => region.id);
    expect(blankIds({ op: 'gmul', aHex: '57', bHex: '83' })).toEqual([]);
    expect(blankIds({ op: 'xtime', aHex: '57', bHex: '00' })).toEqual(['shifted', 'result']);
    expect(blankIds({ op: 'ginv', aHex: '53', bHex: '00' })).toEqual(['result']);
    const ginvFacet = state(trace({ op: 'ginv', aHex: '53', bHex: '00' }));
    expect([...unwrittenAt(ginvFacet, -1).keys()]).toEqual(['result']);
  });
});
