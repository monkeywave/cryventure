import { getFacet, supportedLocales, type Locale, type MathFacet, type Messages, type StateFacet } from '@cryventure/core';
import { primitiveManifests } from '@cryventure/primitives';
import { loadPluginCatalogs } from './catalogs.ts';
import { mathFacetRefs } from './checks.ts';
import { runOrThrow } from './primitiveContract.ts';

/** Repo-relative path of the math view's test fixture (views may not import primitives, hence a JSON snapshot). */
export const MATH_VIEW_FIXTURE = 'packages/views/src/math/fixtures/gmul-57-83.json';

export interface MathViewFixture {
  state: StateFacet<string, { op: string }>;
  math: MathFacet;
  /** The gf256 catalog entries the math facet references, per locale. */
  labels: Record<Locale, Messages>;
}

/** The fixture as a fresh gf256 run of the FIPS 197 §4.2 preset {57} • {83} = {c1} produces it. */
export async function buildMathViewFixture(): Promise<MathViewFixture> {
  const manifest = primitiveManifests.find((candidate) => candidate.id === 'gf256')!;
  const preset = manifest.presets.find((candidate) => candidate.id === 'fips197-mul')!;
  const bundle = runOrThrow(await manifest.load(), preset.params);
  const math = getFacet<MathFacet>(bundle, 'math')!;
  const catalogs = loadPluginCatalogs('primitives', 'gf256');
  const keys = [...new Set(mathFacetRefs(math).map((ref) => ref.key))].sort();
  const labelsIn = (locale: Locale): Messages => Object.fromEntries(keys.map((key) => [key, catalogs[locale][key] ?? key]));
  return {
    state: getFacet<StateFacet<string, { op: string }>>(bundle, 'state')!,
    math,
    labels: Object.fromEntries(supportedLocales.map((locale) => [locale, labelsIn(locale)])) as Record<Locale, Messages>,
  };
}
