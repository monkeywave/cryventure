import { definePrimitive, i18nRef, RecordingTracer, type TraceBundle, type ValuesFacet, type WordopsFacet } from '@cryventure/core';
import { primitiveContract } from './primitiveContract.ts';
import { producerRegistry } from './runWithPorts.ts';

/** A minimal primitive declaring a `wordops` facet: the contract kit must validate it, check its keys, step range and valueRefs. */
const ID = 'wordops-fixture';
const ns = `plugin.${ID}`;

const VALUE_ID = 'k0';

const wordops: WordopsFacet = {
  kind: 'wordops',
  schemaVersion: 1,
  wordBits: 32,
  registerNames: ['a'],
  steps: [
    {
      step: 0,
      formula: i18nRef(`${ns}.formula.add`, { t: 0 }),
      terms: [
        { id: 'k', label: i18nRef(`${ns}.term.k`), hex: '428a2f98', role: 'constant', valueRef: VALUE_ID },
        { id: 'a', label: i18nRef(`${ns}.term.a`), hex: '6a09e667', role: 'result', op: 'add' },
      ],
      registers: { before: ['00000000'], after: ['6a09e667'] },
    },
  ],
};

const values: ValuesFacet = { kind: 'values', schemaVersion: 1, values: [{ id: VALUE_ID, labelKey: `${ns}.value.k`, role: 'constant', bytes: [0x42, 0x8a, 0x2f, 0x98], createdAt: -1 }] };

/** One state step, so the wordops step at index 0 has a state step to align with. */
function oneStepState() {
  const tracer = new RecordingTracer<'a', { op: 'add' }>([{ id: 'a', labelKey: `${ns}.region.a`, elem: 'u8', shape: [1] }], { a: [0] });
  tracer.step({ op: 'add', writes: [{ region: 'a', offset: 0, values: [0x6a] }], highlights: [], narration: i18nRef(`${ns}.step.add`) });
  return tracer.toFacet();
}

const bundle: TraceBundle = {
  schemaVersion: 1,
  producer: { kind: 'primitive', id: ID, apiVersion: 1 },
  provenance: 'modeled',
  params: {},
  facets: { 'state@default': oneStepState(), 'values@default': values, 'wordops@default': wordops },
  output: { word: [0x6a, 0x09, 0xe6, 0x67] },
};

const catalog = (prefix: string) => ({
  [`${ns}.title`]: `${prefix} fixture`,
  [`${ns}.formula.add`]: `${prefix} a = k + a ({{t}})`,
  [`${ns}.term.k`]: `${prefix} k`,
  [`${ns}.term.a`]: `${prefix} a`,
  [`${ns}.value.k`]: `${prefix} K0`,
  [`${ns}.region.a`]: `${prefix} region a`,
  [`${ns}.step.add`]: `${prefix} add`,
});

const manifest = definePrimitive<Record<string, never>>({
  kind: 'primitive',
  id: ID,
  apiVersion: 1,
  family: 'test',
  implements: [],
  titleKey: `${ns}.title`,
  refs: [],
  facets: ['wordops', 'values'],
  presets: [],
  defaults: {},
  i18nNamespace: ns,
  validate: () => ({ ok: true, value: {} }),
  load: () => Promise.resolve({ run: () => ({ ok: true, trace: bundle }) }),
});

const conformance = { source: 'FIPS 180-4 §4.2.2 (K0)', cases: [{ name: 'first word', params: {}, outputs: { word: '6a09e667' } }] };

// No port params: an empty producer set.
primitiveContract(manifest, { catalogs: { en: catalog('EN'), de: catalog('DE') }, conformance, producers: { list: [], lookup: producerRegistry([]) } });
