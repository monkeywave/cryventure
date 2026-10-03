import { narrationFromState, parseHexOfLength, RecordingTracer, type MathFacet, type PrimitiveManifest, type RegionSpec, type TableFacet, type TraceBundle } from '@cryventure/core';
import { describe, expect, it } from 'vitest';
import {
  derivationGroupRefs,
  emittedNarration,
  jsonRoundTrip,
  keysOutsideNamespace,
  manifestLabelKeys,
  mathFacetRefs,
  mathStepRangeProblems,
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
  unknownParamFields,
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

describe('mathFacetRefs', () => {
  it('collects formulas and term labels once each', () => {
    const formula = { key: 'plugin.x.f', params: { a: '57' } };
    const label = { key: 'plugin.x.term.a' };
    const term = { id: 'a', label, value: 1, width: 8, role: 'operand' as const };
    const steps = [0, 1].map((step) => ({ step, formula, terms: [term] }));
    expect(mathFacetRefs({ kind: 'math', schemaVersion: 1, notation: { field: 'gf2^8', modulus: 0x11b }, steps })).toEqual([formula, label]);
  });
});

describe('tableFacetRefs', () => {
  it('collects the title', () => {
    const title = { key: 'plugin.x.table' };
    expect(tableFacetRefs({ kind: 'table', schemaVersion: 1, title, rows: 1, cols: 1, entries: [0] })).toEqual([title]);
  });
});

describe('mathStepRangeProblems', () => {
  const math = (steps: number[]): MathFacet => ({
    kind: 'math',
    schemaVersion: 1,
    notation: { field: 'gf2^8', modulus: 0x11b },
    steps: steps.map((step) => ({ step, formula: { key: 'plugin.x.f' }, terms: [] })),
  });

  it('accepts math steps that point at state steps', () => expect(mathStepRangeProblems(math([0, 2]), 3)).toEqual([]));

  it('reports math steps beyond the last state step', () => {
    expect(mathStepRangeProblems(math([0, 3, 4]), 3)).toEqual(['math step 3 has no state step (0..2)', 'math step 4 has no state step (0..2)']);
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
