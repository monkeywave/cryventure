import { definePrimitive, i18nRef, RecordingTracer, type SpongeFacet, type TraceBundle } from '@cryventure/core';
import { primitiveContract } from './primitiveContract.ts';
import { producerRegistry } from './runWithPorts.ts';

/** A minimal primitive declaring a `sponge` facet: the contract kit must validate it, check its label keys and step range. */
const ID = 'sponge-fixture';
const ns = `plugin.${ID}`;

/** 2 × 1 lanes of 8 bits, one rate lane: absorb 0x01, then one round. */
const sponge: SpongeFacet = {
  kind: 'sponge',
  schemaVersion: 1,
  label: i18nRef(`${ns}.sponge`, { bits: 16 }),
  width: 2,
  height: 1,
  laneBits: 8,
  rounds: 1,
  rateLanes: 1,
  steps: [
    { step: 0, phase: 'absorb', lanes: ['01', '00'], input: ['01'] },
    { step: 1, phase: 'round', round: 0, lanes: ['00', '01'] },
  ],
};

/** Two state steps, so both sponge steps have a state step to align with. */
function twoStepState() {
  const tracer = new RecordingTracer<'s', { op: 'absorb' | 'round' }>([{ id: 's', labelKey: `${ns}.region.s`, elem: 'u8', shape: [2] }], { s: [0, 0] });
  tracer.step({ op: 'absorb', writes: [{ region: 's', offset: 0, values: [1] }], highlights: [], narration: i18nRef(`${ns}.step.absorb`) });
  tracer.step({ op: 'round', writes: [{ region: 's', offset: 0, values: [0, 1] }], highlights: [], narration: i18nRef(`${ns}.step.round`) });
  return tracer.toFacet();
}

const bundle: TraceBundle = {
  schemaVersion: 1,
  producer: { kind: 'primitive', id: ID, apiVersion: 1 },
  provenance: 'modeled',
  params: {},
  facets: { 'state@default': twoStepState(), 'sponge@default': sponge },
  output: { lanes: [0x00, 0x01] },
};

const catalog = (prefix: string) => ({
  [`${ns}.title`]: `${prefix} fixture`,
  [`${ns}.sponge`]: `${prefix} toy-f[{{bits}}]`,
  [`${ns}.region.s`]: `${prefix} lanes`,
  [`${ns}.step.absorb`]: `${prefix} absorb`,
  [`${ns}.step.round`]: `${prefix} round`,
});

const manifest = definePrimitive<Record<string, never>>({
  kind: 'primitive',
  id: ID,
  apiVersion: 1,
  family: 'test',
  implements: [],
  titleKey: `${ns}.title`,
  refs: [],
  facets: ['sponge'],
  presets: [],
  defaults: {},
  i18nNamespace: ns,
  validate: () => ({ ok: true, value: {} }),
  load: () => Promise.resolve({ run: () => ({ ok: true, trace: bundle }) }),
});

const conformance = { source: 'synthetic toy sponge', cases: [{ name: 'one round', params: {}, outputs: { lanes: '0001' } }] };

// No port params: an empty producer set.
primitiveContract(manifest, { catalogs: { en: catalog('EN'), de: catalog('DE') }, conformance, producers: { list: [], lookup: producerRegistry([]) } });
