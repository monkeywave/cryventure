import type { DeriverManifest, TraceBundle } from '@cryventure/core';
import { describe, expect, it } from 'vitest';
import {
  alignSpanSequences,
  appliesToBundle,
  derivedAlignProblems,
  derivedKindProblems,
  derivedSchemaProblems,
  deriverManifestProblems,
  deriverNamespace,
  i18nRefsIn,
  malformedRefProblems,
  memoryLifetimeProblems,
  refsOutsideNamespace,
  stateStepCount,
  unknownValueRefProblems,
  valueRefsIn,
} from './deriverChecks.ts';

const bundle = (facets: Record<string, unknown>, producerId = 'aes'): TraceBundle => ({
  schemaVersion: 1,
  producer: { kind: 'primitive', id: producerId, apiVersion: 1 },
  provenance: 'modeled',
  params: {},
  facets,
  output: {},
});

const manifest: DeriverManifest = { kind: 'deriver', id: 'demo', apiVersion: 1, from: ['state'], provides: ['registers'], load: async () => ({ derive: () => ({}) }) };

describe('deriverManifestProblems', () => {
  it('passes a valid manifest', () => expect(deriverManifestProblems(manifest)).toEqual([]));

  it('flags bad basics, kind, empty provides and a missing load', () => {
    const broken = { ...manifest, id: 'Bad', kind: 'view', provides: [], load: undefined } as unknown as DeriverManifest;
    expect(deriverManifestProblems(broken)).toEqual([expect.stringContaining('kebab-case'), 'kind is "view", expected "deriver"', 'provides no facet kind', 'has no load() function']);
  });
});

describe('appliesToBundle', () => {
  it('needs every from kind and appliesTo (default true)', () => {
    expect(appliesToBundle(manifest, bundle({ 'state@default': {} }))).toBe(true);
    expect(appliesToBundle(manifest, bundle({ 'values@default': {} }))).toBe(false);
    expect(appliesToBundle({ ...manifest, appliesTo: (b) => b.producer.id === 'aes' }, bundle({ 'state@default': {} }, 'xor'))).toBe(false);
  });
});

describe('derivedKindProblems', () => {
  it('accepts provided kinds in any variant', () => expect(derivedKindProblems(['registers'], { 'registers@a': {}, 'registers@b': {} })).toEqual([]));

  it('flags bad keys, unprovided kinds and provided kinds not returned', () => {
    expect(derivedKindProblems(['registers', 'memory'], { registers: {}, 'state@default': {} })).toEqual([
      'key "registers" is not kind@variant',
      'key "state@default" is not a provided kind (registers, memory)',
      'provided kind "registers" was not returned',
      'provided kind "memory" was not returned',
    ]);
  });
});

describe('derivedSchemaProblems', () => {
  it('validates kinds with a core validator and skips the rest', () => {
    const registers = { kind: 'registers', schemaVersion: 1, label: { key: 'k' }, file: { isa: 'x', byteOrder: 'little', registers: [{ name: 'r', bits: 12, lanes: [] }] }, steps: [] };
    expect(derivedSchemaProblems({ 'registers@x': registers, 'demo@default': { anything: true } })).toEqual(['registers@x: registers: register "r": bits 12 is not a positive multiple of 8']);
  });

  it('reports a validator that throws on a malformed facet', () => {
    expect(derivedSchemaProblems({ 'instructions@x': {} })).toEqual([expect.stringMatching(/^instructions@x: validator threw .*malformed facet$/)]);
  });
});

describe('wordops in derived facets', () => {
  const term = (id: string, extra: Record<string, unknown> = {}) => ({ id, label: { key: `deriver.demo.${id}` }, hex: '428a2f98', role: 'constant', ...extra });
  const wordops = (terms: unknown[], formula: unknown = { key: 'deriver.demo.f' }) => ({ kind: 'wordops', schemaVersion: 1, wordBits: 32, steps: [{ step: 0, formula, terms }] });

  it('validates wordops facets with the core validator', () => {
    expect(derivedSchemaProblems({ 'wordops@x': wordops([term('k')]) })).toEqual([]);
    expect(derivedSchemaProblems({ 'wordops@x': wordops([term('k', { hex: '428a2f9' })]) })).toEqual(['wordops@x: wordops step 0 term "k": hex "428a2f9" is not 8 lowercase hex digits']);
  });

  it('checks wordops term shapes with the core validator (empty id, role, op)', () => {
    const facet = wordops([term(''), term('r', { role: 'bogus' }), term('o', { op: 'rotr2' })]);
    expect(derivedSchemaProblems({ 'wordops@x': facet })).toEqual([
      'wordops@x: wordops step 0 term 0: id is not a non-empty string',
      'wordops@x: wordops step 0 term "r": role "bogus" is not a MathTermRole',
      'wordops@x: wordops step 0 term "o": op "rotr2" is not a WordOp',
    ]);
  });

  it('flags malformed refs in the wordops formula and term labels', () => {
    const facet = wordops([term('k'), { ...term('w'), label: 'W' }], { key: 'deriver.demo.f', params: { n: [] } });
    expect(malformedRefProblems({ 'wordops@x': facet })).toEqual([
      'wordops@x: steps[0].formula is not an I18nRef { key, params? }',
      'wordops@x: steps[0].terms[1].label is not an I18nRef { key, params? }',
    ]);
  });

  it('flags wordops term valueRefs the values facet lacks', () => {
    const facet = wordops([term('k', { valueRef: 'k0' }), term('w', { valueRef: 'w0' })]);
    const withValues = bundle({ 'values@default': { values: [{ id: 'k0' }] } });
    expect(unknownValueRefProblems({ 'wordops@x': facet }, withValues)).toEqual(['wordops@x: valueRef "w0" is not in the values facet']);
  });

  it('finds wordops refs for the EN/DE and namespace checks', () => {
    expect(i18nRefsIn(wordops([term('k')]))).toEqual([{ key: 'deriver.demo.f' }, { key: 'deriver.demo.k' }]);
  });
  it('validates wordops v2 fields (and only with schemaVersion 2), finding no refs in them', () => {
    const registers = { before: ['00000000'], after: ['428a2f98'], touched: [0], transfers: [{ to: 0, from: { term: 'k' } }] };
    const v2 = { ...wordops([term('k', { emphasis: 'story' })]), schemaVersion: 2, registerNames: ['a'], registerColumns: 1 };
    v2.steps[0] = { ...v2.steps[0]!, registers } as never;
    expect(derivedSchemaProblems({ 'wordops@x': v2 })).toEqual([]);
    expect(derivedSchemaProblems({ 'wordops@x': { ...v2, schemaVersion: 1 } })).toEqual([
      'wordops@x: wordops: registerColumns needs schemaVersion 2',
      'wordops@x: wordops step 0 term "k": emphasis needs schemaVersion 2',
      'wordops@x: wordops step 0: registers.touched needs schemaVersion 2',
      'wordops@x: wordops step 0: registers.transfers needs schemaVersion 2',
    ]);
    expect(malformedRefProblems({ 'wordops@x': v2 })).toEqual([]);
    expect(i18nRefsIn(v2)).toEqual([{ key: 'deriver.demo.f' }, { key: 'deriver.demo.k' }]);
  });

  it('reports a malformed wordops facet as problems, not as a throwing validator', () => {
    expect(derivedSchemaProblems({ 'wordops@x': null, 'wordops@y': { schemaVersion: 2, wordBits: 64, steps: [null] } })).toEqual([
      'wordops@x: wordops: facet is not an object',
      'wordops@y: wordops steps[0]: not an object',
    ]);
  });
});

describe('sponge in derived facets', () => {
  const lanes = new Array<string>(4).fill('00');
  const sponge = (label: unknown = { key: 'deriver.demo.sponge' }) => ({ kind: 'sponge', schemaVersion: 1, label, width: 2, height: 2, laneBits: 8, rounds: 1, rateLanes: 2, steps: [{ step: 0, phase: 'absorb', lanes }] });

  it('validates sponge facets with the core validator', () => {
    expect(derivedSchemaProblems({ 'sponge@x': sponge() })).toEqual([]);
    expect(derivedSchemaProblems({ 'sponge@x': { ...sponge(), laneBits: 12 } })).toEqual(['sponge@x: sponge: laneBits 12 is not 8, 16, 32 or 64']);
  });

  it('flags a malformed sponge label and finds a well-formed one for the EN/DE and namespace checks', () => {
    expect(malformedRefProblems({ 'sponge@x': sponge('Keccak') })).toEqual(['sponge@x: label is not an I18nRef { key, params? }']);
    expect(malformedRefProblems({ 'sponge@x': sponge() })).toEqual([]);
    expect(i18nRefsIn(sponge())).toEqual([{ key: 'deriver.demo.sponge' }]);
  });
});

describe('alignSpanSequences / derivedAlignProblems', () => {
  const facet = {
    instructions: [{ align: { first: -1, last: -1 }, reads: [{ kind: 'reg' }] }, { align: { first: 0, last: 2 } }],
    writes: [{ align: { first: 1, last: 1 } }],
    other: [{ step: 1 }],
    allocations: [{ align: 16, layout: { align: 4 } }],
    broken: [{ align: { first: 'x' } }],
  };

  it('collects one sequence per array of aligned steps, skipping numeric byte alignment (malformed spans become NaN)', () => {
    const sequences = alignSpanSequences(facet);
    expect(sequences.slice(0, 2)).toEqual([[{ first: -1, last: -1 }, { first: 0, last: 2 }], [{ first: 1, last: 1 }]]);
    expect(sequences[2]?.[0]?.first).toBeNaN();
    expect(sequences).toHaveLength(3);
  });

  it('checks every sequence against the state step count', () => {
    const { broken: _broken, ...clean } = facet;
    expect(derivedAlignProblems({ 'demo@x': clean }, 3)).toEqual([]);
    expect(derivedAlignProblems({ 'demo@x': clean }, 2)).toEqual(['demo@x: align: span 1 last 2 outside -1..1']);
  });
});

describe('alignSpanSequences with partially aligned arrays', () => {
  const facet = { writes: [{ align: { first: 0, last: 0 } }, { addr: '0x1' }, { align: { first: 1, last: 1 } }, { align: 7 }] };

  it('treats an array as spans when any item has an align object, skipping items without one', () => {
    expect(alignSpanSequences(facet)).toEqual([[{ first: 0, last: 0 }, { first: 1, last: 1 }]]);
  });

  it('reports the items of such an array that have no align span', () => {
    expect(derivedAlignProblems({ 'demo@x': facet }, 3)).toEqual(['demo@x: align: item 1 of an aligned array has no align span', 'demo@x: align: item 3 of an aligned array has no align span']);
  });
});

describe('memoryLifetimeProblems', () => {
  const allocation = { id: 'ks', space: 'stack', addr: '0x1000', size: 16, align: 16, label: { key: 'deriver.demo.ks' }, allocatedAt: 1, freedAt: 3 };
  const write = (first: number, last: number, addr = '0x1000') => ({ align: { first, last }, addr, bytes: [1, 2] });
  const memory = (writes: unknown[], allocations: unknown[] = [allocation]) => ({
    kind: 'memory',
    schemaVersion: 1,
    label: { key: 'deriver.demo.memory' },
    provenance: 'modeled',
    target: { triple: 'x86_64-linux-gnu', dataModel: 'LP64', ptrSize: 8, endian: 'little' },
    allocations,
    writes,
  });

  it('accepts writes inside the allocation lifetime, and allocations never freed', () => {
    expect(memoryLifetimeProblems(memory([write(1, 1), write(1, 2)]) as never)).toEqual([]);
    expect(memoryLifetimeProblems(memory([write(5, 9)], [{ ...allocation, freedAt: undefined }]) as never)).toEqual([]);
  });

  it('flags writes before the allocation exists or at/after its release', () => {
    expect(memoryLifetimeProblems(memory([write(0, 1), write(2, 3), write(4, 4, '0x1008')]) as never)).toEqual([
      'memory: write 0 (steps 0..1) starts before allocation "ks" exists (allocatedAt 1)',
      'memory: write 1 (steps 2..3) is not done before allocation "ks" is freed (freedAt 3)',
      'memory: write 2 (steps 4..4) is not done before allocation "ks" is freed (freedAt 3)',
    ]);
  });

  it('skips writes outside every allocation or with a malformed address (the core validator reports them)', () => {
    expect(memoryLifetimeProblems(memory([write(0, 0, '0x2000'), write(0, 0, 'zz')]) as never)).toEqual([]);
  });

  it('runs as part of derivedSchemaProblems for memory facets', () => {
    expect(derivedSchemaProblems({ 'memory@x': memory([write(1, 1)]) })).toEqual([]);
    expect(derivedSchemaProblems({ 'memory@x': memory([write(0, 0)]) })).toEqual(['memory@x: memory: write 0 (steps 0..0) starts before allocation "ks" exists (allocatedAt 1)']);
  });
});

describe('stateStepCount', () => {
  it('counts state steps, 0 without a state facet', () => {
    expect(stateStepCount(bundle({ 'state@default': { steps: [{}, {}] } }))).toBe(2);
    expect(stateStepCount(bundle({}))).toBe(0);
  });
});

describe('valueRefsIn / unknownValueRefProblems', () => {
  const facet = { reads: [{ valueRef: 'a' }], allocations: [{ valueRef: 'b', refs: [{ valueRef: 'a' }] }], terms: [{ valueRef: 3 }] };

  it('collects every string valueRef once', () => expect(valueRefsIn(facet)).toEqual(['a', 'b']));

  it('flags ids the values facet lacks', () => {
    const withValues = bundle({ 'values@default': { values: [{ id: 'a' }] } });
    expect(unknownValueRefProblems({ 'memory@x': facet }, withValues)).toEqual(['memory@x: valueRef "b" is not in the values facet']);
    expect(unknownValueRefProblems({ 'memory@x': facet }, bundle({}))).toHaveLength(2);
  });
});

describe('i18nRefsIn / refsOutsideNamespace', () => {
  it('finds { key, params? } objects only, deduplicated', () => {
    const facet = { label: { key: 'deriver.demo.a' }, steps: [{ note: { key: 'deriver.demo.b', params: { n: 1 } } }, { note: { key: 'deriver.demo.a' } }], notRef: { key: 'x', other: 1 }, badParams: { key: 'y', params: { n: {} } } };
    expect(i18nRefsIn(facet)).toEqual([{ key: 'deriver.demo.a' }, { key: 'deriver.demo.b', params: { n: 1 } }]);
  });

  it('collects exact-shape refs in fields the kit does not know (generic fallback)', () => {
    const facet = { kind: 'demo-steps', extra: { key: 'deriver.demo.z' }, withParams: { key: 'deriver.demo.y', params: { n: 2 } }, nearRef: { key: 'deriver.demo.w', id: 3 } };
    expect(i18nRefsIn({ 'demo-steps@x': facet })).toEqual([{ key: 'deriver.demo.z' }, { key: 'deriver.demo.y', params: { n: 2 } }]);
    expect(malformedRefProblems({ 'demo-steps@x': facet })).toEqual([]);
  });

  it('flags malformed refs in the known ref fields of each facet kind', () => {
    const facets = {
      'memory@x': { label: { key: 'deriver.demo.a', extra: 1 }, impl: { id: 'c', label: 'plain text' }, allocations: [{ label: { key: 'deriver.demo.b' } }, { label: { key: 'deriver.demo.c', params: { n: {} } } }] },
      'instructions@x': { label: { key: 'deriver.demo.i' }, instructions: [{ covers: [{ key: 'deriver.demo.c1' }, 'x'], note: { key: 1 } }, { align: { first: 0, last: 0 } }] },
      'field@x': { steps: [{ formula: { key: 'deriver.demo.f' }, terms: [{ label: { text: 'a' } }] }] },
      'table@x': { title: null },
    };
    expect(malformedRefProblems(facets)).toEqual([
      'memory@x: label is not an I18nRef { key, params? }',
      'memory@x: impl.label is not an I18nRef { key, params? }',
      'memory@x: allocations[1].label is not an I18nRef { key, params? }',
      'instructions@x: instructions[0].note is not an I18nRef { key, params? }',
      'instructions@x: instructions[0].covers[1] is not an I18nRef { key, params? }',
      'field@x: steps[0].terms[0].label is not an I18nRef { key, params? }',
      'table@x: title is not an I18nRef { key, params? }',
    ]);
  });

  it('accepts well-formed refs in known fields and skips optional ones that are absent', () => {
    const facets = { 'memory@x': { label: { key: 'deriver.demo.a' }, allocations: [] }, 'math@x': { steps: [{ formula: { key: 'deriver.demo.m', params: { n: 1 } }, terms: [] }] } };
    expect(malformedRefProblems(facets)).toEqual([]);
  });

  it('flags refs outside the namespace', () => {
    expect(refsOutsideNamespace([{ key: 'deriver.demo.a' }, { key: 'deriver.demox.a' }], deriverNamespace('demo'))).toEqual(['ref "deriver.demox.a" is outside deriver.demo.*']);
  });
});
