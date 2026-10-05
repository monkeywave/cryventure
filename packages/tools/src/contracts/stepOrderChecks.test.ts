import { definePrimitive, i18nRef, latestStepAt, RecordingTracer, type MathFacet, type TraceBundle, type WordopsFacet } from '@cryventure/core';
import { describe, expect, it } from 'vitest';
import { derivedSchemaProblems } from './deriverChecks.ts';
import { LATEST_STEP_FACET_KINDS, stepOrderProblems } from './stepOrderChecks.ts';

const ns = 'plugin.step-order-fake';

const math = (steps: number[]): MathFacet => ({
  kind: 'math',
  schemaVersion: 1,
  notation: { field: 'gf2^8', modulus: 0x11b },
  steps: steps.map((step) => ({ step, formula: i18nRef(`${ns}.f`), terms: [] })),
});

const wordops = (steps: number[]) => ({ kind: 'wordops', schemaVersion: 2, steps: steps.map((step) => ({ step, terms: [] })) }) as unknown as WordopsFacet;

function threeStepState() {
  const tracer = new RecordingTracer<'a', { op: 'load' }>([{ id: 'a', labelKey: `${ns}.region.a`, elem: 'u8', shape: [1] }], { a: [0] });
  for (let index = 0; index < 3; index++) tracer.step({ op: 'load', writes: [{ region: 'a', offset: 0, values: [index] }], highlights: [], narration: i18nRef(`${ns}.step`) });
  return tracer.toFacet();
}

/**
 * A producer that declares only `state` yet emits an undeclared `math` facet and a `wordops` facet
 * under a non-default variant, both with steps that are not strictly increasing. The primitive
 * contract validated math/field/wordops/sponge only for declared kinds and only the default variant,
 * so this bundle slipped through, and a view's `latestStepAt` would throw at render.
 */
const fakeBundle: TraceBundle = {
  schemaVersion: 1,
  producer: { kind: 'primitive', id: 'step-order-fake', apiVersion: 1 },
  provenance: 'modeled',
  params: {},
  facets: { 'state@default': threeStepState(), 'math@default': math([0, 2, 2]), 'wordops@alt': wordops([1, 0]) },
  output: {},
};

const fakeProducer = definePrimitive<Record<string, never>>({
  kind: 'primitive',
  id: 'step-order-fake',
  apiVersion: 1,
  family: 'test',
  implements: [],
  titleKey: `${ns}.title`,
  refs: [],
  facets: ['state'],
  presets: [],
  defaults: {},
  i18nNamespace: ns,
  validate: () => ({ ok: true, value: {} }),
  load: () => Promise.resolve({ run: () => ({ ok: true, trace: fakeBundle }) }),
});

async function fakeRun(): Promise<TraceBundle> {
  const result = (await fakeProducer.load()).run({});
  if (!result.ok) throw new Error('fake producer failed');
  return result.trace;
}

describe('stepOrderProblems', () => {
  it('covers every facet kind a view reads with latestStepAt', () => {
    expect([...LATEST_STEP_FACET_KINDS].sort()).toEqual(['field', 'math', 'sponge', 'wordops']);
  });

  it('the fake producer’s facets would make latestStepAt throw at render', async () => {
    const bundle = await fakeRun();
    expect(() => latestStepAt((bundle.facets['math@default'] as MathFacet).steps, 2)).toThrow(RangeError);
    expect(() => latestStepAt((bundle.facets['wordops@alt'] as WordopsFacet).steps, 1)).toThrow(RangeError);
  });

  it('rejects undeclared kinds and non-default variants whose steps do not strictly increase', async () => {
    expect(stepOrderProblems((await fakeRun()).facets)).toEqual(['math@default: step 2 at index 2 does not increase (after 2)', 'wordops@alt: step 0 at index 1 does not increase (after 1)']);
  });

  it('accepts strictly increasing steps (the initial state −1 first) and ignores other kinds', () => {
    expect(stepOrderProblems({ 'math@default': math([-1, 0, 5]), 'wordops@x': wordops([]), 'state@default': threeStepState() })).toEqual([]);
  });

  it('reports a malformed steps list or a non-numeric step instead of throwing', () => {
    expect(stepOrderProblems({ 'sponge@default': { kind: 'sponge' }, 'field@default': { kind: 'field', steps: [{ step: '1' }] } })).toEqual(['sponge@default: steps is not an array', 'field@default: step "1" at index 0 is not a number']);
  });
});

describe('derivedSchemaProblems (deriver facets)', () => {
  it('already rejects a derived per-step facet whose steps do not strictly increase', () => {
    expect(derivedSchemaProblems({ 'math@x': math([1, 1]) })).toEqual(['math@x: math: step 1 does not increase (after 1)']);
  });
});
