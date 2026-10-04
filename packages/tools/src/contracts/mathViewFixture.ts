import { getFacet, supportedLocales, type Locale, type MathFacet, type Messages, type StateFacet } from '@cryventure/core';
import { loadPluginCatalogs } from './catalogs.ts';
import { termFacetRefs } from './checks.ts';
import { runPreset } from './modeViewFixture.ts';

/** Repo-relative path of the math view's test fixture (views may not import primitives, hence a JSON snapshot). */
export const MATH_VIEW_FIXTURE = 'packages/views/src/math/fixtures/gmul-57-83.json';

export interface MathViewFixture {
  state: StateFacet<string, { op: string }>;
  math: MathFacet;
  /** The gf256 catalog entries the math facet references, per locale. */
  labels: Record<Locale, Messages>;
}

/** The fixture as a fresh gf256 run of the FIPS 197 §4.2 preset {57} • {83} = {c1} produces it. */
export function buildMathViewFixture(): Promise<MathViewFixture> {
  return buildMathFixture('gf256', 'fips197-mul');
}

/** The HMAC ipad/opad bit strips (RFC 4231 TC1): XOR only, where the GF(2⁸) modulus is irrelevant. */
export const HMAC_MATH_VIEW_FIXTURE = 'packages/views/src/math/fixtures/hmac-pads.json';

export function buildHmacMathViewFixture(): Promise<MathViewFixture> {
  return buildMathFixture('hmac', 'rfc4231-tc1');
}

/** A fresh run of `<producer>/<presetId>` (ports resolved) reduced to its state and math facets and their labels. */
async function buildMathFixture(producer: string, presetId: string): Promise<MathViewFixture> {
  const bundle = await runPreset(producer, presetId);
  const math = getFacet<MathFacet>(bundle, 'math')!;
  const catalogs = loadPluginCatalogs('primitives', producer);
  const keys = [...new Set(termFacetRefs(math).map((ref) => ref.key))].sort();
  const labelsIn = (locale: Locale): Messages => Object.fromEntries(keys.map((key) => [key, catalogs[locale][key] ?? key]));
  return {
    state: getFacet<StateFacet<string, { op: string }>>(bundle, 'state')!,
    math,
    labels: Object.fromEntries(supportedLocales.map((locale) => [locale, labelsIn(locale)])) as Record<Locale, Messages>,
  };
}
