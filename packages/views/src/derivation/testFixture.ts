import {
  RecordingTracer,
  type DerivationFacet,
  type Messages,
  type TraceBundle,
} from '@cryventure/core';
import fixture from './fixtures/aes128-derivation.json';
import kdfFixture from './fixtures/kdf-derivations.json';

/**
 * Test-only: the derivation facet of the AES module's FIPS 197 App. B run (AES-128, op detail),
 * generated from `@cryventure/primitives` and kept fresh by a tools contract test. Views may not
 * import primitives, hence the JSON snapshot.
 */
export const aesDerivation = fixture.derivation as DerivationFacet;
export const aesStepCount = fixture.stepCount;

/** A bundle with the fixture derivation plus an empty-write state facet so the playhead can move. */
export function aesDerivationBundle(): TraceBundle {
  return derivationBundle('aes', aesDerivation, aesStepCount);
}

/** A bundle of `producerId` with `derivation` plus an empty-write state facet of `stepCount` steps. */
function derivationBundle(producerId: string, derivation: DerivationFacet, stepCount: number): TraceBundle {
  const tracer = new RecordingTracer<'s', { op: 'tick' }>(
    [{ id: 's', labelKey: 'fixture.region.s', elem: 'u8', shape: [1] }],
    { s: [0] },
  );
  for (let i = 0; i < stepCount; i++)
    tracer.step({ op: 'tick', writes: [], highlights: [], narration: { key: 'fixture.tick' } });
  return {
    schemaVersion: 1,
    producer: { kind: 'primitive', id: producerId, apiVersion: 1 },
    provenance: 'modeled',
    params: {},
    facets: { 'state@default': tracer.toFacet(), 'derivation@default': derivation },
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
    'plugin.aes.derivation.roundKey': 'Round key {{n}}',
    'plugin.aes.derivation.title': 'Key schedule',
  },
  de: {
    'plugin.aes.derivation.keyWord': 'Schlüsselwort w[{{i}}]',
    'plugin.aes.derivation.word': 'Wort w[{{i}}]',
    'plugin.aes.derivation.roundKey': 'Rundenschlüssel {{n}}',
    'plugin.aes.derivation.title': 'Schlüsselplan',
  },
};

/**
 * Test-only: real MAC/KDF derivations (HMAC with a hashed long key, HKDF RFC 5869 A.1, PBKDF2 RFC 6070
 * c = 4096 with its skip step, the TLS 1.0 PRF), snapshotted from `@cryventure/primitives` by a tools
 * contract test (`pnpm fixtures:update`), with the catalog entries they reference.
 */
export type KdfProducer = 'hmac' | 'hkdf' | 'pbkdf2' | 'tls10-prf';

export function kdfDerivation(producer: KdfProducer): { derivation: DerivationFacet; stepCount: number } {
  const found = kdfFixture.cases.find((entry) => entry.producer === producer)!;
  return { derivation: found.derivation as DerivationFacet, stepCount: found.stepCount };
}

export const kdfDerivations: readonly DerivationFacet[] = kdfFixture.cases.map((entry) => entry.derivation as DerivationFacet);

export const kdfLabels: Record<'en' | 'de', Messages> = kdfFixture.labels;

/** A bundle of `producer`'s derivation plus an empty-write state facet of its step count. */
export function kdfDerivationBundle(producer: KdfProducer): TraceBundle {
  const { derivation, stepCount } = kdfDerivation(producer);
  return derivationBundle(producer, derivation, stepCount);
}
