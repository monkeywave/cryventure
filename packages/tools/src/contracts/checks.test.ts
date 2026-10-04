import { narrationFromState, parseHexOfLength, RecordingTracer, type AnyStateFacet, type FieldFacet, type I18nRef, type MathFacet, type NarrationFacet, type PrimitiveManifest, type RegionSpec, type TableFacet, type TraceBundle, type WordopsFacet } from '@cryventure/core';
import { describe, expect, it } from 'vitest';
import { validateFieldFacet, validateWordopsFacet } from '@cryventure/core';
import {
  derivationGroupRefs,
  emittedNarration,
  facetStepRangeProblems,
  jsonRoundTrip,
  normalFormProblems,
  keysOutsideNamespace,
  manifestLabelKeys,
  initialNarrationProblems,
  missingFacetKinds,
  missingKeys,
  refProblems,
  regionLayoutProblems,
  replayProblems,
  runtimeLabelKeys,
  scopeLevelKeys,
  sequentialReplay,
  tableFacetRefs,
  tableSelectParamProblems,
  termFacetRefs,
  termValueRefProblems,
  unknownParamFields,
  wordopsShapeProblems,
} from './checks.ts';

const catalogs = {
  en: { 'plugin.x.title': 'X', 'plugin.x.step': 'Step {{n}}', 'other.key': 'O' },
  de: { 'plugin.x.title': 'X-de', 'plugin.x.step': 'Schritt' },
};

const regions: RegionSpec<'s'>[] = [{ id: 's', labelKey: 'plugin.x.region.s', elem: 'u8', shape: [2] }];

function bundle(): TraceBundle {
  const tracer = new RecordingTracer<'s', { op: 'w' }>(regions, { s: [0, 0] }, { keyframeInterval: 1 });
  tracer.step({ op: 'w', writes: [{ region: 's', offset: 0, values: [1] }], highlights: [], narration: { key: 'plugin.x.step', params: { n: 1 } } });
  tracer.step({ op: 'w', writes: [{ region: 's', offset: 1, values: [2] }], highlights: [], narration: { key: 'plugin.x.step', params: { n: 2 } } });
  const state = tracer.toFacet();
  const values = { kind: 'values', schemaVersion: 1, values: [{ id: 'k', labelKey: 'plugin.x.value.k', role: 'key', bytes: [1], createdAt: 0 }] };
  return { schemaVersion: 1, producer: { kind: 'primitive', id: 'x', apiVersion: 1 }, provenance: 'modeled', params: {}, facets: { 'state@default': state, 'values@default': values, 'narration@default': narrationFromState(state) }, output: {} };
}

describe('missingKeys', () => {
  it('lists locale:key for absent keys', () => {
    expect(missingKeys(['plugin.x.title', 'other.key'], catalogs)).toEqual(['de:other.key']);
  });
});

describe('keysOutsideNamespace', () => {
  it('flags keys not under the namespace', () => {
    expect(keysOutsideNamespace(catalogs, 'plugin.x')).toEqual(['en:other.key']);
  });
});

describe('refProblems', () => {
  it('reports missing keys and param mismatches per locale', () => {
    expect(refProblems([{ key: 'plugin.x.step', params: { n: 1 } }, { key: 'nope' }], catalogs)).toEqual(['en:nope missing', 'de:plugin.x.step params [n] vs template []', 'de:nope missing']);
  });

  it('checks a plural ref against the params of all its forms together (a form may leave some out)', () => {
    const plural = {
      en: { 'plugin.p.step_one': 'One block of {{size}}.', 'plugin.p.step_other': '{{count}} blocks of {{size}}.' },
      de: { 'plugin.p.step_one': 'Ein Block zu {{size}}.', 'plugin.p.step_other': '{{count}} Blöcke.' },
    };
    expect(refProblems([{ key: 'plugin.p.step', params: { count: 1, size: 4 } }], plural)).toEqual([]);
    expect(refProblems([{ key: 'plugin.p.step', params: { count: 2, size: 4 } }], plural)).toEqual([]);
    expect(refProblems([{ key: 'plugin.p.step', params: { count: 2 } }], plural)).toEqual(['en:plugin.p.step params [count] vs template [size,count]', 'de:plugin.p.step params [count] vs template [size,count]']);
    expect(refProblems([{ key: 'plugin.p.step', params: { count: 2, size: 4, extra: 1 } }], plural)).toHaveLength(2);
  });
});

describe('emittedNarration / runtimeLabelKeys / missingFacetKinds', () => {
  it('collects distinct narration refs from narration and state facets', () => {
    expect(emittedNarration(bundle())).toEqual([
      { key: 'plugin.x.step', params: { n: 1 } },
      { key: 'plugin.x.step', params: { n: 2 } },
    ]);
  });

  it('collects region and value label keys', () => {
    expect(runtimeLabelKeys(bundle())).toEqual(['plugin.x.region.s', 'plugin.x.value.k']);
  });

  it('lists declared kinds without a facet', () => {
    expect(missingFacetKinds(['state', 'memory'], bundle())).toEqual(['memory']);
  });

  it('includes the state facet\'s initial narration', () => {
    const base = bundle();
    const state = { ...(base.facets['state@default'] as AnyStateFacet), initialNarration: { key: 'plugin.x.initial', params: { a: '01' } } };
    expect(emittedNarration({ ...base, facets: { ...base.facets, 'state@default': state } })).toContainEqual({ key: 'plugin.x.initial', params: { a: '01' } });
  });

  it('tolerates bundles without facets', () => {
    const empty = { ...bundle(), facets: {} };
    expect([emittedNarration(empty), runtimeLabelKeys(empty)]).toEqual([[], []]);
  });
});

describe('sequentialReplay / replayProblems', () => {
  const state = () => bundle().facets['state@default'] as Parameters<typeof replayProblems>[0];

  it('replays every step from the initial snapshot', () => {
    expect(sequentialReplay(state())).toEqual([{ s: [1, 0] }, { s: [1, 2] }]);
  });

  it('passes consistent facets and flags a corrupted keyframe', () => {
    expect(replayProblems(state())).toEqual([]);
    const corrupted = { ...state(), keyframes: [{ step: 0, snapshot: { s: [9, 9] } }, { step: 5, snapshot: { s: [0, 0] } }] };
    expect(replayProblems(corrupted)).toEqual(['keyframe at step 0 differs from replay', 'keyframe at step 5 differs from replay', 'stateAt(0) differs from replay', 'stateAt(1) differs from replay']);
  });
});

describe('jsonRoundTrip', () => {
  it('preserves JSON data and exposes non-JSON values', () => {
    expect(jsonRoundTrip(bundle())).toEqual(bundle());
    expect(jsonRoundTrip({ bytes: new Uint8Array([1]) })).not.toEqual({ bytes: new Uint8Array([1]) });
  });
});

describe('unknownParamFields', () => {
  it('lists field names missing from defaults', () => {
    const fields = [
      { name: 'keyHex', labelKey: 'plugin.x.param.key', kind: 'hex' as const },
      { name: 'ivHex', labelKey: 'plugin.x.param.iv', kind: 'hex' as const },
    ];
    expect(unknownParamFields(fields, { keyHex: '00' })).toEqual(['ivHex']);
    expect(unknownParamFields(fields, null)).toEqual(['keyHex', 'ivHex']);
  });
});

describe('scopeLevelKeys', () => {
  it('lists each level template plus its optional next/prev labels', () => {
    const scopeLevels = [{ labelKey: 'p.scope.round', nextKey: 'p.scope.round.next', prevKey: 'p.scope.round.prev' }, { labelKey: 'p.scope.op' }];
    expect(scopeLevelKeys({ scopeLevels })).toEqual(['p.scope.round', 'p.scope.round.next', 'p.scope.round.prev', 'p.scope.op']);
    expect(scopeLevelKeys({})).toEqual([]);
  });

  it('is part of the runtime label keys', () => {
    const base = bundle();
    const state = { ...(base.facets['state@default'] as object), scopeLevels: [{ labelKey: 'plugin.x.scope', nextKey: 'plugin.x.scope.next' }] };
    expect(runtimeLabelKeys({ ...base, facets: { ...base.facets, 'state@default': state } })).toContain('plugin.x.scope.next');
  });
});

describe('manifestLabelKeys', () => {
  it('collects op label/short keys and output label keys, each once', () => {
    const ops = { a: { labelKey: 'p.op.a', shortLabelKey: 'p.opShort.a' }, b: { labelKey: 'p.op.b' } };
    expect(manifestLabelKeys({ ops, outputs: { out: { labelKey: 'p.op.a' } } })).toEqual(['p.op.a', 'p.opShort.a', 'p.op.b']);
    expect(manifestLabelKeys({})).toEqual([]);
  });
});

describe('regionLayoutProblems', () => {
  const region = (layout: RegionSpec<'r'>['layout'], elem: RegionSpec<'r'>['elem'] = 'u8'): RegionSpec<'r'> => ({ id: 'r', labelKey: 'l', elem, shape: [4, 4], ...(layout === undefined ? {} : { layout }) });

  it('accepts grids, missing layouts and word sizes that divide the region bytes', () => {
    expect(regionLayoutProblems([region(undefined), region({ kind: 'grid' }), region({ kind: 'words', wordBytes: 4 }), region({ kind: 'words', wordBytes: 32 }, 'u16')])).toEqual([]);
  });

  it('flags word sizes that do not divide the region bytes', () => {
    expect(regionLayoutProblems([region({ kind: 'words', wordBytes: 3 })])).toEqual(['region "r": wordBytes 3 does not divide its 16 bytes']);
    expect(regionLayoutProblems([region({ kind: 'words', wordBytes: 0 })])).toHaveLength(1);
  });
});

describe('derivationGroupRefs', () => {
  it('returns the declared group labels', () => {
    const label = { key: 'plugin.x.step', params: { n: 1 } };
    expect(derivationGroupRefs({ kind: 'derivation', schemaVersion: 1, nodes: [], groups: [{ id: 0, label }] })).toEqual([label]);
    expect(derivationGroupRefs({ kind: 'derivation', schemaVersion: 1, nodes: [] })).toEqual([]);
  });
});

describe('termFacetRefs (math)', () => {
  it('collects formulas and term labels once each', () => {
    const formula = { key: 'plugin.x.f', params: { a: '57' } };
    const label = { key: 'plugin.x.term.a' };
    const term = { id: 'a', label, value: 1, width: 8, role: 'operand' as const };
    const steps = [0, 1].map((step) => ({ step, formula, terms: [term] }));
    const math: MathFacet = { kind: 'math', schemaVersion: 1, notation: { field: 'gf2^8', modulus: 0x11b }, steps };
    expect(termFacetRefs(math)).toEqual([formula, label]);
  });
});

describe('tableFacetRefs', () => {
  it('collects the title', () => {
    const title = { key: 'plugin.x.table' };
    expect(tableFacetRefs({ kind: 'table', schemaVersion: 1, title, rows: 1, cols: 1, entries: [0] })).toEqual([title]);
  });
});

describe('facetStepRangeProblems (math)', () => {
  const math = (steps: number[]): MathFacet => ({
    kind: 'math',
    schemaVersion: 1,
    notation: { field: 'gf2^8', modulus: 0x11b },
    steps: steps.map((step) => ({ step, formula: { key: 'plugin.x.f' }, terms: [] })),
  });

  const steps = (count: number) => ({ steps: new Array(count).fill(undefined) });
  const narrated = { key: 'plugin.x.initial' };

  it('accepts math steps that point at state steps', () => expect(facetStepRangeProblems('math', math([0, 2]), steps(3))).toEqual([]));

  it('accepts a step −1 math entry when the state facet narrates its initial state', () => {
    expect(facetStepRangeProblems('math', math([-1, 0]), { ...steps(1), initialNarration: narrated })).toEqual([]);
  });

  it('reports a step −1 math entry without an initial narration', () => {
    expect(facetStepRangeProblems('math', math([-1, 0]), steps(1))).toEqual(['math step -1 (initial state) has no initialNarration on the state facet']);
  });

  it('reports math steps beyond the last state step or before the initial state', () => {
    expect(facetStepRangeProblems('math', math([-2, 0, 3, 4]), steps(3))).toEqual([
      'math step -2 has no state step (-1..2)',
      'math step 3 has no state step (-1..2)',
      'math step 4 has no state step (-1..2)',
    ]);
  });
});

describe('field facet checks', () => {
  const term = (id: string, valueRef?: string, bytes: number[] = new Array(16).fill(0)) => ({ id, label: { key: `plugin.x.term.${id}` }, bytes, role: 'operand' as const, ...(valueRef === undefined ? {} : { valueRef }) });
  const field = (steps: FieldFacet['steps']): FieldFacet => ({ kind: 'field', schemaVersion: 1, notation: { field: 'gf2^128', modulus: 'x^128+x^7+x^2+x+1', bitOrder: 'gcm-reflected' }, steps });
  const valid = field([{ step: 0, formula: { key: 'plugin.x.f', params: { n: 1 } }, terms: [term('h', 'h'), term('x')] }]);
  const broken = field([
    { step: 2, formula: { key: 'plugin.x.f' }, terms: [term('h', 'nope', [1, 2])] },
    { step: 1, formula: { key: 'plugin.x.f' }, terms: [] },
  ]);

  it('validates a synthetic broken field facet with the core validator', () => {
    expect(validateFieldFacet(valid)).toEqual([]);
    expect(validateFieldFacet(broken)).toEqual(['field step 2 term "h": 2 bytes, expected 16', 'field: step 1 does not increase (after 2)']);
  });

  it('reports field steps outside the state steps', () => {
    const state = { steps: new Array(2).fill(undefined) };
    expect(facetStepRangeProblems('field', valid, state)).toEqual([]);
    expect(facetStepRangeProblems('field', broken, state)).toEqual(['field step 2 has no state step (-1..1)']);
  });

  it('collects formula and term label refs, checked in EN and DE', () => {
    expect(termFacetRefs(valid)).toEqual([{ key: 'plugin.x.f', params: { n: 1 } }, { key: 'plugin.x.term.h' }, { key: 'plugin.x.term.x' }]);
    const fieldCatalogs = { en: { 'plugin.x.f': 'F {{n}}', 'plugin.x.term.h': 'H', 'plugin.x.term.x': 'X' }, de: { 'plugin.x.f': 'F', 'plugin.x.term.h': 'H' } };
    expect(refProblems(termFacetRefs(valid), fieldCatalogs)).toEqual(['de:plugin.x.f params [n] vs template []', 'de:plugin.x.term.x missing']);
  });

  it('reports term valueRefs the values facet lacks', () => {
    const values = { values: [{ id: 'h', labelKey: 'k', role: 'subkey' as const, bytes: [], createdAt: 0 }] };
    expect(termValueRefProblems('field', valid, values)).toEqual([]);
    expect(termValueRefProblems('field', broken, values)).toEqual(['field step 2 term "h": valueRef "nope" is not in the values facet']);
    expect(termValueRefProblems('field', valid, undefined)).toEqual(['field step 0 term "h": valueRef "h" is not in the values facet']);
  });
});

describe('wordops facet checks', () => {
  const term = (id: string, valueRef?: string, hex = '6a09e667') => ({ id, label: { key: `plugin.x.term.${id}` }, hex, role: 'operand' as const, op: 'add' as const, ...(valueRef === undefined ? {} : { valueRef }) });
  const wordops = (steps: WordopsFacet['steps']): WordopsFacet => ({ kind: 'wordops', schemaVersion: 1, wordBits: 32, registerNames: ['a', 'b'], steps });
  const valid = wordops([{ step: 0, formula: { key: 'plugin.x.t1', params: { t: 0 } }, terms: [term('w', 'w'), term('k')], registers: { before: ['00000000', '00000001'], after: ['00000002', '00000003'] } }]);
  const broken = wordops([
    { step: 2, formula: { key: 'plugin.x.t1' }, terms: [term('w', 'nope', '6A09E667')] },
    { step: 1, formula: { key: 'plugin.x.t1' }, terms: [] },
  ]);

  it('validates a synthetic broken wordops facet with the core validator', () => {
    expect(validateWordopsFacet(valid)).toEqual([]);
    expect(validateWordopsFacet(broken)).toEqual(['wordops step 2 term "w": hex "6A09E667" is not 8 lowercase hex digits', 'wordops: step 1 does not increase (after 2)']);
  });

  it('checks term and register shapes the core validator does not (and never throws)', () => {
    expect(wordopsShapeProblems(valid)).toEqual([]);
    const badTerms = wordops([{ step: 0, formula: { key: 'plugin.x.t1' }, terms: [{ ...term('w'), id: '' }, { ...term('k'), role: 'input' as never }, { ...term('s'), op: 'rotr2' as never }] }]);
    expect(wordopsShapeProblems(badTerms)).toEqual([
      'wordops step 0 term 0: id is not a non-empty string',
      'wordops step 0 term "k": role "input" is not a MathTermRole',
      'wordops step 0 term "s": op "rotr2" is not a WordOp',
    ]);
    const noAfter = wordops([{ step: 0, formula: { key: 'plugin.x.t1' }, terms: [], registers: { before: ['00000000', '00000001'] } as never }]);
    expect(validateWordopsFacet(noAfter)).toEqual(['wordops step 0: registers.after is not an array']);
    expect(wordopsShapeProblems(noAfter)).toEqual(['wordops step 0: registers.after is not an array']);
    expect(wordopsShapeProblems({ kind: 'wordops', wordBits: 32, steps: {} })).toEqual(['wordops: steps is not an array']);
    expect(wordopsShapeProblems(wordops([{ step: 0, formula: { key: 'plugin.x.t1' }, terms: 'w' as never }]))).toEqual(['wordops step 0: terms is not an array']);
    expect(wordopsShapeProblems(null)).toEqual(['wordops: facet is not an object']);
  });

  it('includes the core validator problems', () => expect(wordopsShapeProblems(broken)).toEqual(validateWordopsFacet(broken)));

  it('reports wordops steps outside the state steps', () => {
    const state = { steps: new Array(2).fill(undefined) };
    expect(facetStepRangeProblems('wordops', valid, state)).toEqual([]);
    expect(facetStepRangeProblems('wordops', broken, state)).toEqual(['wordops step 2 has no state step (-1..1)']);
  });

  it('collects formula and term label refs, checked in EN and DE', () => {
    expect(termFacetRefs(valid)).toEqual([{ key: 'plugin.x.t1', params: { t: 0 } }, { key: 'plugin.x.term.w' }, { key: 'plugin.x.term.k' }]);
    const wordopsCatalogs = { en: { 'plugin.x.t1': 'T1 {{t}}', 'plugin.x.term.w': 'W', 'plugin.x.term.k': 'K' }, de: { 'plugin.x.t1': 'T1 {{t}}', 'plugin.x.term.w': 'W' } };
    expect(refProblems(termFacetRefs(valid), wordopsCatalogs)).toEqual(['de:plugin.x.term.k missing']);
  });

  it('reports term valueRefs the values facet lacks', () => {
    const values = { values: [{ id: 'w', labelKey: 'k', role: 'state' as const, bytes: [], createdAt: 0 }] };
    expect(termValueRefProblems('wordops', valid, values)).toEqual([]);
    expect(termValueRefProblems('wordops', broken, values)).toEqual(['wordops step 2 term "w": valueRef "nope" is not in the values facet']);
    expect(termValueRefProblems('wordops', valid, undefined)).toEqual(['wordops step 0 term "w": valueRef "w" is not in the values facet']);
  });
});

describe('tableSelectParamProblems', () => {
  type Params = { byteHex: string; other: string };
  const validate: PrimitiveManifest<Params>['validate'] = (params) => {
    const { byteHex, other } = params as Params;
    const parsed = parseHexOfLength(byteHex, [1], { invalidType: 'x.invalid', wrongLength: 'x.length' });
    return parsed.ok ? { ok: true, value: { byteHex: parsed.hex, other } } : { ok: false, error: parsed.error };
  };
  const manifest = { defaults: { byteHex: '00', other: 'o' }, validate };
  const table = (selectParam: string | undefined, selected = 0x53): TableFacet => ({
    kind: 'table',
    schemaVersion: 1,
    title: { key: 'plugin.x.table' },
    rows: 16,
    cols: 16,
    entries: new Array<number>(256).fill(0),
    selected,
    ...(selectParam === undefined ? {} : { selectParam }),
  });

  it('accepts a selectParam of the defaults whose selected index validates as hex', () => {
    expect(tableSelectParamProblems(table('byteHex'), manifest, manifest.defaults)).toEqual([]);
    expect(tableSelectParamProblems(table(undefined), manifest, manifest.defaults)).toEqual([]);
  });

  it('reports a selectParam that is not a param', () => {
    expect(tableSelectParamProblems(table('byte'), manifest, manifest.defaults)).toEqual(['table: selectParam "byte" is not a key of manifest.defaults']);
  });

  it('reports a selected index that does not round-trip through validate as hex', () => {
    expect(tableSelectParamProblems(table('byteHex', 0x153), manifest, manifest.defaults)).toEqual(['table: selected 339 as byteHex "153" does not round-trip through validate']);
  });
});

describe('initialNarrationProblems', () => {
  const withInitial = (narration: NarrationFacet | undefined, initialNarration?: I18nRef): TraceBundle => {
    const base = bundle();
    const state = { ...(base.facets['state@default'] as AnyStateFacet), ...(initialNarration === undefined ? {} : { initialNarration }) };
    const facets: TraceBundle['facets'] = { 'state@default': state, ...(narration === undefined ? {} : { 'narration@default': narration }) };
    return { ...base, facets };
  };
  const initial = { key: 'plugin.x.initial' };

  it('accepts a narration facet derived from the state facet, with or without an initial narration', () => {
    const state = (b: TraceBundle) => b.facets['state@default'] as AnyStateFacet;
    const narrated = withInitial(undefined, initial);
    expect(initialNarrationProblems(withInitial(narrationFromState(state(narrated)), initial))).toEqual([]);
    expect(initialNarrationProblems(bundle())).toEqual([]);
    expect(initialNarrationProblems(withInitial(undefined, initial))).toEqual([]);
  });

  it('reports a narration facet whose step −1 entry disagrees with the initial narration', () => {
    const plain = narrationFromState(bundle().facets['state@default'] as AnyStateFacet);
    expect(initialNarrationProblems(withInitial(plain, initial))).toEqual(['narration step -1 is missing, but the state facet has initialNarration "plugin.x.initial"']);
    const extra: NarrationFacet = { ...plain, entries: [{ step: -1, ref: initial }, ...plain.entries] };
    expect(initialNarrationProblems(withInitial(extra))).toEqual(['narration step -1 is "plugin.x.initial", but the state facet has no initialNarration']);
  });
});

describe('normalFormProblems', () => {
  /** Lowercases `keyHex`, strips spaces and adds a default `mode`, the way a normalising validator might. */
  const normalising = {
    validate: (value: unknown) => {
      const params = value as { keyHex: string; mode?: string };
      return { ok: true, value: { mode: params.mode ?? 'enc', keyHex: params.keyHex.toLowerCase().replace(/ /g, '') } };
    },
  } as unknown as Pick<PrimitiveManifest, 'validate'>;

  it('accepts params already in normal form, whatever the key order', () => {
    expect(normalFormProblems(normalising, [{ name: 'defaults', params: { keyHex: 'ab', mode: 'enc' } }])).toEqual([]);
  });

  it('reports keys a validator adds or rewrites', () => {
    expect(normalFormProblems(normalising, [{ name: 'preset p', params: { keyHex: 'A B' } }])).toEqual([
      'preset p: keyHex is "A B", validate() gives "ab"',
      'preset p: mode is undefined, validate() gives "enc"',
    ]);
  });

  it('reports params validate() rejects', () => {
    const rejecting = { validate: () => ({ ok: false, error: { key: 'bad' } }) } as unknown as Pick<PrimitiveManifest, 'validate'>;
    expect(normalFormProblems(rejecting, [{ name: 'defaults', params: {} }])).toEqual(['defaults: rejected by validate() (bad)']);
  });
});
