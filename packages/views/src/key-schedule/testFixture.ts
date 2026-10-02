import { RecordingTracer, type DerivationFacet, type Messages, type TraceBundle } from '@cryventure/core';
import fixture from './fixtures/aes128-derivation.json';

/**
 * Test-only: the derivation facet of the AES module's FIPS 197 App. B run (AES-128, op detail),
 * generated from `@cryventure/primitives` and kept fresh by a tools contract test. Views may not
 * import primitives, hence the JSON snapshot.
 */
export const aesDerivation = fixture.derivation as DerivationFacet;
export const aesStepCount = fixture.stepCount;

/** A bundle with the fixture derivation plus an empty-write state facet so the playhead can move. */
export function keyScheduleBundle(): TraceBundle {
  const tracer = new RecordingTracer<'s', { op: 'tick' }>([{ id: 's', labelKey: 'fixture.region.s', elem: 'u8', shape: [1] }], { s: [0] });
  for (let i = 0; i < aesStepCount; i++) tracer.step({ op: 'tick', writes: [], highlights: [], narration: { key: 'fixture.tick' } });
  return {
    schemaVersion: 1,
    producer: { kind: 'primitive', id: 'aes', apiVersion: 1 },
    provenance: 'modeled',
    params: {},
    facets: { 'state@default': tracer.toFacet(), 'derivation@default': aesDerivation },
    output: {},
  };
}

/** Producer labels the view renders (normally from the AES plugin catalog). */
export const derivationLabels: Record<'en' | 'de', Messages> = {
  en: {
    'plugin.aes.derivation.keyWord': 'Key word w[{{i}}]',
    'plugin.aes.derivation.word': 'Word w[{{i}}]',
    'plugin.aes.derivation.rotWord': 'RotWord for w[{{i}}]',
    'plugin.aes.derivation.subWord': 'SubWord for w[{{i}}]',
    'plugin.aes.derivation.rcon': 'Round constant Rcon[{{i}}]',
    'plugin.aes.derivation.xorRcon': '⊕ Rcon for w[{{i}}]',
  },
  de: {
    'plugin.aes.derivation.keyWord': 'Schlüsselwort w[{{i}}]',
    'plugin.aes.derivation.word': 'Wort w[{{i}}]',
  },
};
