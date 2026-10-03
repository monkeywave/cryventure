import {
  fieldStepAt,
  getFacet,
  ghash,
  gf128MulSteps,
  INITIAL_STEP_INDEX,
  parseHexToArray,
  toHex,
  validateFieldFacet,
  type AnyStateFacet,
  type FieldFacet,
  type I18nRef,
  type NarrationFacet,
  type TraceBundle,
  type ValuesFacet,
} from '@cryventure/core';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { iterationVariant, R_BYTES, recordGhash, setBitsGcm, fieldTerm, V_REDUCTION_BIT } from './ghashTrace.ts';
import de from './i18n/de.json';
import en from './i18n/en.json';
import { GHASH_INPUT_LENGTHS, GHASH_PRESETS, ghashManifest, readGhashHex, validateGhashParams, type GhashParams } from './manifest.ts';
import { ghashBlocks, run } from './module.ts';
import conformance from './vectors/conformance.json';

const NS = 'plugin.ghash';
const TC2_H = '66e94bd4ef8a2c3b884cfa59ca342b2e';
const TC2_C = '0388dace60b6a392f328c2b971b2fe78';
const TC2_LEN = '00000000000000000000000000000080';
const TC2_GHASH = 'f38cbb1ad69223dcc3457ae5b6b0f885';

function trace(params: GhashParams): TraceBundle {
  const result = run(params);
  if (!result.ok) throw new Error(`run failed: ${result.error.key}`);
  return result.trace;
}
const state = (bundle: TraceBundle) => getFacet<AnyStateFacet>(bundle, 'state')!;
const field = (bundle: TraceBundle) => getFacet<FieldFacet>(bundle, 'field')!;
const ghashOf = (params: GhashParams) => toHex(trace(params).output['ghash']!);
const blockArb = (blocks: number) => fc.uint8Array({ minLength: 16 * blocks, maxLength: 16 * blocks });

describe('ghash manifest validation', () => {
  it('normalises hex and accepts both details', () => {
    expect(validateGhashParams({ hHex: TC2_H.toUpperCase(), inputHex: `${TC2_C.slice(0, 16)} ${TC2_C.slice(16)}`, detail: 'bit' })).toEqual({ ok: true, value: { hHex: TC2_H, inputHex: TC2_C, detail: 'bit' } });
  });

  it('rejects non-objects, a wrong H length, unaligned or too long input and an unknown detail', () => {
    const base = { hHex: TC2_H, inputHex: TC2_C, detail: 'block' };
    const errorKey = (params: unknown) => {
      const result = validateGhashParams(params);
      return result.ok ? undefined : result.error;
    };
    expect(errorKey(null)?.key).toBe(`${NS}.error.invalidParams`);
    expect(errorKey({ ...base, hHex: 'abcd' })).toEqual({ key: `${NS}.error.hLength`, params: { length: 2 } });
    expect(errorKey({ ...base, inputHex: `${TC2_C}00` })).toEqual({ key: `${NS}.error.inputLength`, params: { length: 17 } });
    expect(errorKey({ ...base, inputHex: TC2_C.repeat(5) })).toEqual({ key: `${NS}.error.inputLength`, params: { length: 80 } });
    expect(errorKey({ ...base, inputHex: '' })?.key).toMatch(/inputLength|core\.error\.hex/);
    expect(errorKey({ ...base, detail: 'nibble' })).toEqual({ key: `${NS}.error.detail`, params: { detail: 'nibble' } });
    expect(errorKey({ ...base, inputHex: 42 })?.key).toBe(`${NS}.error.invalidParams`);
  });

  it('readGhashHex reports a wrong byte count with the given key', () => {
    expect(readGhashHex('00', [16], 'x.len')).toEqual({ ok: false, error: { key: 'x.len', params: { length: 1 } } });
    expect(readGhashHex('00'.repeat(32), GHASH_INPUT_LENGTHS, 'x.len')).toMatchObject({ ok: true, hex: '00'.repeat(32) });
  });

  it('defaults and every preset validate; labels exist in EN and DE', () => {
    for (const params of [ghashManifest.defaults, ...GHASH_PRESETS.map((preset) => preset.params)]) expect(validateGhashParams(params).ok).toBe(true);
    for (const preset of GHASH_PRESETS) {
      expect(en).toHaveProperty([preset.labelKey]);
      expect(de).toHaveProperty([preset.labelKey]);
    }
  });
});

describe('ghash presets and vectors', () => {
  it('TC 2 preset: input is C ‖ len block and GHASH recomputes to the spec value', () => {
    const preset = GHASH_PRESETS.find((candidate) => candidate.id === 'mcgrew-viega-tc2')!;
    expect(preset.params).toEqual({ hHex: TC2_H, inputHex: TC2_C + TC2_LEN, detail: 'block' });
    expect(toHex(ghash(Uint8Array.from(parseHexToArray(TC2_H)), Uint8Array.from(parseHexToArray(TC2_C + TC2_LEN))))).toBe(TC2_GHASH);
    expect(ghashOf(preset.params)).toBe(TC2_GHASH);
  });

  it('the one-block preset runs at bit detail with 1 + 128 steps', () => {
    const preset = GHASH_PRESETS.find((candidate) => candidate.id === 'one-block-bits')!;
    expect(preset.params.detail).toBe('bit');
    expect(state(trace(preset.params)).steps).toHaveLength(129);
  });

  it.each(conformance.cases)('conformance: $name', ({ params, outputs }) => {
    expect(ghashOf(params as GhashParams)).toBe(outputs.ghash);
  });
});

describe('ghash run equals core ghash', () => {
  it('for random H and 1–4 blocks, at both details', () => {
    fc.assert(
      fc.property(blockArb(1), fc.integer({ min: 1, max: 4 }).chain(blockArb), fc.constantFrom<GhashParams['detail']>('block', 'bit'), (h, input, detail) => {
        expect(ghashOf({ hHex: toHex(h), inputHex: toHex(input), detail })).toBe(toHex(ghash(h, input)));
      }),
      { numRuns: 60 },
    );
  });
});

describe('ghash helpers', () => {
  it('ghashBlocks splits into 16-byte blocks', () => {
    const input = Array.from({ length: 48 }, (_, i) => i);
    expect(ghashBlocks(input)).toEqual([input.slice(0, 16), input.slice(16, 32), input.slice(32)]);
  });

  it('setBitsGcm lists set bits in GCM order (bit 0 = MSB of byte 0)', () => {
    expect(setBitsGcm(R_BYTES)).toEqual([0, 1, 2, 7]);
    expect(setBitsGcm([0x01, 0x80])).toEqual([7, 8]);
    expect(setBitsGcm([0, 0])).toEqual([]);
  });

  it('fieldTerm labels under plugin.ghash.term and copies the bytes', () => {
    const bytes = new Array<number>(16).fill(1);
    const term = fieldTerm('zBefore', 'z', { i: 3 }, bytes, 'intermediate', { bits: [127] });
    expect(term).toEqual({ id: 'zBefore', label: { key: `${NS}.term.z`, params: { i: 3 } }, bytes, role: 'intermediate', bits: [127] });
    expect(term.bytes).not.toBe(bytes);
  });

  it('iterationVariant combines the add/skip and reduce/shift cases', () => {
    expect(iterationVariant({ xBit: 1, reduced: true })).toBe('addReduce');
    expect(iterationVariant({ xBit: 1, reduced: false })).toBe('addShift');
    expect(iterationVariant({ xBit: 0, reduced: true })).toBe('skipReduce');
    expect(iterationVariant({ xBit: 0, reduced: false })).toBe('skipShift');
  });
});

describe('recordGhash', () => {
  const h = parseHexToArray(TC2_H);
  const blocks = ghashBlocks(parseHexToArray(TC2_C + TC2_LEN));

  it('block detail: xorBlock then multiply per block, scoped block → op, one field step per multiply', () => {
    const recording = recordGhash(h, blocks, 'block');
    expect(recording.state.steps.map((step) => step.op)).toEqual(['xorBlock', 'multiply', 'xorBlock', 'multiply']);
    expect(recording.state.steps.map((step) => step.scope)).toEqual([[0, 0], [0, 1], [1, 0], [1, 1]]);
    expect(recording.state.regions.map((region) => region.id)).toEqual(['h', 'block', 'x']);
    expect(recording.field.steps.map((step) => step.step)).toEqual([INITIAL_STEP_INDEX, 1, 3]);
    expect(toHex(recording.ys[1]!)).toBe(TC2_GHASH);
    expect(validateFieldFacet(recording.field)).toEqual([]);
  });

  it('block detail: the multiply field step holds X, H and the product', () => {
    const recording = recordGhash(h, blocks, 'block');
    const multiply = recording.field.steps[1]!;
    expect(multiply.terms.map((term) => [term.id, term.role, term.op])).toEqual([
      ['x', 'operand', undefined],
      ['h', 'operand', 'mul'],
      ['y', 'result', 'result'],
    ]);
    expect(multiply.terms[2]!.bytes).toEqual(recording.ys[0]);
  });

  it('bit detail: per block xorBlock then 128 mulBit iterations scoped block → op → i, writing Y at the last', () => {
    const recording = recordGhash(h, blocks.slice(0, 1), 'bit');
    const { steps } = recording.state;
    expect(steps).toHaveLength(129);
    expect(steps.slice(1).every((step) => step.op === 'mulBit')).toBe(true);
    expect(steps[1]!.scope).toEqual([0, 1, 0]);
    expect(steps[128]!.scope).toEqual([0, 1, 127]);
    expect(steps[128]!.writes.map((write) => write.region)).toEqual(['z', 'v', 'x']);
    expect(steps[127]!.writes.map((write) => write.region)).toEqual(['z', 'v']);
    expect(recording.state.regions.map((region) => region.id)).toEqual(['h', 'block', 'x', 'z', 'v']);
    expect(recording.field.steps.map((step) => step.step)).toEqual([INITIAL_STEP_INDEX, ...Array.from({ length: 128 }, (_, i) => i + 1)]);
    expect(validateFieldFacet(recording.field)).toEqual([]);
  });

  it('bit detail: emphasises the tested bit of X and the LSB of V; R only when reducing', () => {
    const recording = recordGhash(h, blocks.slice(0, 1), 'bit');
    const x = parseHexToArray(TC2_C);
    const explained = gf128MulSteps(Uint8Array.from(x), Uint8Array.from(h)).steps;
    explained.forEach((iteration, i) => {
      const terms = recording.field.steps[i + 1]!.terms;
      const byId = (id: string) => terms.find((term) => term.id === id);
      expect(byId('x')!.bits).toEqual([i]);
      expect(byId('vBefore')!.bits).toEqual([V_REDUCTION_BIT]);
      expect(byId('vBefore')!.op).toBe(iteration.xBit ? 'xor' : undefined);
      expect(byId('r')?.bits).toEqual(iteration.reduced ? [0, 1, 2, 7] : undefined);
      expect(byId('z')!.bytes).toEqual(Array.from(iteration.z));
      expect(byId('z')!.role).toBe(i === 127 ? 'result' : 'intermediate');
      expect(recording.field.steps[i + 1]!.formula.key).toBe(`${NS}.formula.mulBit.${iterationVariant(iteration)}`);
    });
  });
});

/** Placeholders of a template, sorted. */
const placeholders = (template: string) => [...template.matchAll(/\{\{(\w+)\}\}/g)].map((match) => match[1]!).sort();

/** Problems of one ref against a catalog: missing key or {{params}} that differ from the ref's. */
function refProblems(ref: I18nRef, catalog: Record<string, string>, locale: string): string[] {
  const forms = [ref.key, `${ref.key}_one`, `${ref.key}_other`].filter((key) => key in catalog);
  if (forms.length === 0) return [`${locale}: missing ${ref.key}`];
  const given = Object.keys(ref.params ?? {});
  return forms.flatMap((key) => placeholders(catalog[key]!).filter((name) => !given.includes(name)).map((name) => `${locale}: ${key} lacks {{${name}}}`));
}

describe('ghash bundle', () => {
  const bundles = (['block', 'bit'] as const).map((detail) => trace({ hHex: TC2_H, inputHex: TC2_C + TC2_LEN, detail }));

  it('emits a valid field facet whose formulas and term labels exist in EN and DE', () => {
    for (const bundle of bundles) {
      const facet = field(bundle);
      expect(validateFieldFacet(facet)).toEqual([]);
      const refs = facet.steps.flatMap((step) => [step.formula, ...step.terms.map((term) => term.label)]);
      expect(refs.flatMap((ref) => [...refProblems(ref, en, 'en'), ...refProblems(ref, de, 'de')])).toEqual([]);
    }
  });

  it('aligns field steps with multiply / mulBit state steps', () => {
    for (const bundle of bundles) {
      const steps = state(bundle).steps;
      for (const entry of field(bundle).steps.slice(1)) expect(['multiply', 'mulBit']).toContain(steps[entry.step]!.op);
      expect(fieldStepAt(field(bundle), INITIAL_STEP_INDEX)?.step).toBe(INITIAL_STEP_INDEX);
    }
  });

  it('narrates the initial state at step −1 (per detail, plural by block count)', () => {
    const [block, bit] = bundles.map((bundle) => getFacet<NarrationFacet>(bundle, 'narration')!.entries[0]!);
    expect(block).toEqual({ step: INITIAL_STEP_INDEX, ref: { key: `${NS}.step.initial.block`, params: { count: 2, h: TC2_H } } });
    expect(bit!.ref.key).toBe(`${NS}.step.initial.bit`);
  });

  it('values: H and input from the start, GHASH after the last step', () => {
    const bundle = bundles[0]!;
    const values = getFacet<ValuesFacet>(bundle, 'values')!.values;
    expect(values.map((value) => [value.labelKey, value.role, value.createdAt])).toEqual([
      [`${NS}.value.h`, 'subkey', INITIAL_STEP_INDEX],
      [`${NS}.value.input`, 'public', INITIAL_STEP_INDEX],
      [`${NS}.value.ghash`, 'state', state(bundle).steps.length - 1],
    ]);
  });

  it('both details give the same output; the run error path reports validation', () => {
    expect(bundles[0]!.output).toEqual(bundles[1]!.output);
    expect(run({ hHex: '00', inputHex: TC2_C, detail: 'block' })).toMatchObject({ ok: false, error: { key: `${NS}.error.hLength` } });
  });

  it('EN and DE catalogs have the same keys', () => {
    expect(Object.keys(de).sort()).toEqual(Object.keys(en).sort());
  });
});

/** A catalog template filled like the player fills scope levels (`index`/`value` = raw index, `ordinal` = index + 1). */
const fillScope = (template: string, index: number) => template.replace(/\{\{(\w+)\}\}/g, (_, name: string) => String({ index, value: index, ordinal: index + 1 }[name] ?? `{{${name}}}`));

describe('ghash scope path labels', () => {
  const h = parseHexToArray(TC2_H);
  const catalogs = { en, de } as Record<string, Record<string, string>>;

  it.each([
    ['en', 'Block 2', 'Step 2 of 2', 'Bit 37'],
    ['de', 'Block 2', 'Schritt 2 von 2', 'Bit 37'],
  ])('%s: a bit-detail iteration reads "Block · Step · Bit i" with the iteration as a number', (locale, block, op, bit) => {
    const catalog = catalogs[locale]!;
    expect(fillScope(catalog[`${NS}.scope.block`]!, 1)).toBe(block);
    expect(fillScope(catalog[`${NS}.scope.op`]!, 1)).toBe(op);
    expect(fillScope(catalog[`${NS}.scope.iteration`]!, 37)).toBe(bit);
  });

  it('numbers each bit-detail iteration by the bit of X it reads, so the label changes every step', () => {
    const steps = recordGhash(h, [parseHexToArray(TC2_C)], 'bit').state.steps.filter((step) => step.op === 'mulBit');
    const labels = steps.map((step) => fillScope(en[`${NS}.scope.iteration`], step.scope.at(-1)!));
    expect(steps.every((step) => step.scope.at(-1) === step.narration.params?.['i'])).toBe(true);
    expect(new Set(labels).size).toBe(128);
  });

  it.each([['en', en], ['de', de]])('%s: op short labels are words; • and ⊕ stay inside formulas', (_, catalog) => {
    const short = Object.entries(catalog).filter(([key]) => key.startsWith(`${NS}.opShort.`));
    expect(short).toHaveLength(3);
    expect(short.filter(([, text]) => /[•·⊕×]|ᵢ/.test(text))).toEqual([]);
  });
});
