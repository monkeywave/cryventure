import { RecordingTracer, type MathFacet, type Messages, type TraceBundle } from '@cryventure/core';
import fixture from './fixtures/gmul-57-83.json';

/**
 * Test-only: a hand-written slice of a GF(2⁸) multiplication {57} • {83} = {c1} (FIPS 197 §4.2),
 * shift-and-add style. Math steps sit at state steps 0, 1, 2, 3 and 5 (step 4 keeps step 3's
 * equation). Views may not import primitives, hence the JSON.
 */
export const gmulMath = fixture.math as MathFacet;
export const gmulStepCount = fixture.stepCount;

/** A bundle with the fixture math facet plus an empty-write state facet so the playhead can move. */
export function mathBundle(math: MathFacet = gmulMath): TraceBundle {
  const tracer = new RecordingTracer<'s', { op: 'tick' }>(
    [{ id: 's', labelKey: 'fixture.region.s', elem: 'u8', shape: [1] }],
    { s: [0] },
  );
  for (let i = 0; i < gmulStepCount; i++)
    tracer.step({ op: 'tick', writes: [], highlights: [], narration: { key: 'fixture.tick' } });
  return {
    schemaVersion: 1,
    producer: { kind: 'primitive', id: 'gf256', apiVersion: 1 },
    provenance: 'modeled',
    params: {},
    facets: { 'state@default': tracer.toFacet(), 'math@default': math },
    output: {},
  };
}

/** Producer labels the view renders (normally from the gf256 plugin catalog). */
export const mathLabels: Record<'en' | 'de', Messages> = {
  en: {
    'plugin.gf256.formula.addIfBit': 'Bit {{i}} of b is 1: acc ← acc ⊕ a',
    'plugin.gf256.formula.xtime': 'a ← xtime(a) = a · x',
    'plugin.gf256.formula.xtimeReduce': 'a ← xtime(a), reduced mod m(x)',
    'plugin.gf256.term.a': 'a',
    'plugin.gf256.term.b': 'b',
    'plugin.gf256.term.acc': 'acc',
    'plugin.gf256.term.shifted': 'a ≪ 1',
    'plugin.gf256.term.modulus': 'm(x)',
    'plugin.gf256.term.product': 'a • b',
  },
  de: {
    'plugin.gf256.formula.addIfBit': 'Bit {{i}} von b ist 1: acc ← acc ⊕ a',
    'plugin.gf256.formula.xtime': 'a ← xtime(a) = a · x',
    'plugin.gf256.formula.xtimeReduce': 'a ← xtime(a), reduziert mod m(x)',
    'plugin.gf256.term.a': 'a',
    'plugin.gf256.term.b': 'b',
    'plugin.gf256.term.acc': 'acc',
    'plugin.gf256.term.shifted': 'a ≪ 1',
    'plugin.gf256.term.modulus': 'm(x)',
    'plugin.gf256.term.product': 'a • b',
  },
};
