import { definePrimitive, i18nRef, RecordingTracer, type MathFacet, type TableFacet, type TraceBundle } from '@cryventure/core';
import { primitiveContract } from './primitiveContract.ts';

/** A minimal primitive declaring `math` and `table` facets: the contract kit must validate both and check their keys. */
const ID = 'math-table-fixture';
const ns = `plugin.${ID}`;

const math: MathFacet = {
  kind: 'math',
  schemaVersion: 1,
  notation: { field: 'gf2^8', modulus: 0x11b },
  steps: [{ step: 0, formula: i18nRef(`${ns}.formula.xtime`, { a: '57' }), terms: [{ id: 'a', label: i18nRef(`${ns}.term.a`), value: 0x57, width: 8, role: 'operand' }] }],
};

const table: TableFacet = {
  kind: 'table',
  schemaVersion: 1,
  title: i18nRef(`${ns}.table.title`),
  rows: 1,
  cols: 2,
  entries: [0x63, 0x7c],
};

/** One state step, so the math step at index 0 has a state step to align with. */
function oneStepState() {
  const tracer = new RecordingTracer<'a', { op: 'load' }>([{ id: 'a', labelKey: `${ns}.region.a`, elem: 'u8', shape: [1] }], { a: [0] });
  tracer.step({ op: 'load', writes: [{ region: 'a', offset: 0, values: [0x57] }], highlights: [], narration: i18nRef(`${ns}.step.load`) });
  return tracer.toFacet();
}

const bundle: TraceBundle = { schemaVersion: 1, producer: { kind: 'primitive', id: ID, apiVersion: 1 }, provenance: 'modeled', params: {}, facets: { 'state@default': oneStepState(), 'math@default': math, 'table@default': table }, output: { entry: [0x63] } };

const catalog = (prefix: string) => ({
  [`${ns}.title`]: `${prefix} fixture`,
  [`${ns}.formula.xtime`]: `${prefix} xtime({{a}})`,
  [`${ns}.term.a`]: `${prefix} a`,
  [`${ns}.region.a`]: `${prefix} region a`,
  [`${ns}.step.load`]: `${prefix} load`,
  [`${ns}.table.title`]: `${prefix} table`,
});

const manifest = definePrimitive<Record<string, never>>({
  kind: 'primitive',
  id: ID,
  apiVersion: 1,
  family: 'test',
  implements: [],
  titleKey: `${ns}.title`,
  refs: [],
  facets: ['math', 'table'],
  presets: [],
  defaults: {},
  i18nNamespace: ns,
  validate: () => ({ ok: true, value: {} }),
  load: () => Promise.resolve({ run: () => ({ ok: true, trace: bundle }) }),
});

const conformance = { source: 'FIPS 197 Table 4', cases: [{ name: 'first S-box entry', params: {}, outputs: { entry: '63' } }] };

primitiveContract(manifest, { catalogs: { en: catalog('EN'), de: catalog('DE') }, conformance });
