import { getFacet, type DerivationFacet, type I18nRef, type Locale, type Messages, type StateFacet } from '@cryventure/core';
import { primitiveManifests } from '@cryventure/primitives';
import { derivationLabelRefs } from './checks.ts';
import { labelsFor, runPreset } from './modeViewFixture.ts';
import { runOrThrow } from './primitiveContract.ts';

/** The derivation view tests use a JSON snapshot of the AES derivation facet (views may not import primitives). */
export const DERIVATION_VIEW_FIXTURE = 'packages/views/src/derivation/fixtures/aes128-derivation.json';

/** The fixture as a fresh AES run of the FIPS 197 App. B preset produces it. */
export async function buildDerivationViewFixture(): Promise<{ stepCount: number | undefined; derivation: unknown }> {
  const manifest = primitiveManifests.find((candidate) => candidate.id === 'aes')!;
  const preset = manifest.presets.find((candidate) => candidate.id === 'fips197-b')!;
  const bundle = runOrThrow(await manifest.load(), preset.params);
  return {
    stepCount: getFacet<StateFacet<string, { op: string }>>(bundle, 'state')?.steps.length,
    derivation: getFacet(bundle, 'derivation'),
  };
}

/**
 * The derivation view tests also render real MAC/KDF derivations (views may not import primitives):
 * HMAC with a hashed long key (op `hash`), HKDF, PBKDF2 with c = 4096 (the skip step) and the TLS 1.0 PRF.
 */
export const KDF_DERIVATION_VIEW_FIXTURE = 'packages/views/src/derivation/fixtures/kdf-derivations.json';

/** The runs the KDF fixture snapshots: `<producer>/<preset>`. */
const KDF_CASES = [
  ['hmac', 'rfc4231-tc6-longkey'],
  ['hkdf', 'rfc5869-a1'],
  ['pbkdf2', 'rfc6070-tc3'],
  ['tls10-prf', 'tls10-master-secret'],
] as const;

export interface KdfDerivationCase {
  producer: string;
  preset: string;
  stepCount: number;
  derivation: DerivationFacet;
}

export interface KdfDerivationViewFixture {
  cases: KdfDerivationCase[];
  /** The plugin catalog entries the facets reference (title, groups, node labels), per locale. */
  labels: Record<Locale, Messages>;
}

/** Every ref the derivation view translates: the headings and each node's label. */
function derivationViewRefs(facet: DerivationFacet): I18nRef[] {
  return [...derivationLabelRefs(facet), ...facet.nodes.map((node) => node.label)];
}

/** The KDF fixture as fresh runs of its cases produce it. */
export async function buildKdfDerivationViewFixture(): Promise<KdfDerivationViewFixture> {
  const cases = await Promise.all(
    KDF_CASES.map(async ([producer, preset]): Promise<KdfDerivationCase> => {
      const bundle = await runPreset(producer, preset);
      const state = getFacet<StateFacet<string, { op: string }>>(bundle, 'state')!;
      return { producer, preset, stepCount: state.steps.length, derivation: getFacet<DerivationFacet>(bundle, 'derivation')! };
    }),
  );
  const refs = cases.flatMap(({ derivation }) => derivationViewRefs(derivation));
  return { cases, labels: labelsFor(refs, KDF_CASES.map(([producer]) => producer)) };
}
