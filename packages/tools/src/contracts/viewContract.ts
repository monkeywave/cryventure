import { assertManifestBasics, type ViewManifest } from '@cryventure/core';
import { primitiveManifests } from '@cryventure/primitives';
import type { ViewComponent } from '@cryventure/viz';
import { beforeAll, describe, expect, it } from 'vitest';
import { loadPluginCatalogs, type LocaleCatalogs } from './catalogs.ts';
import { keysOutsideNamespace, missingKeys } from './checks.ts';
import { ASSEMBLED, fixtureBundlesFor, primitiveFixtureBundles, type FallbackFacets, type NamedBundle } from './facetFixtures.ts';
import { labMessages, renderViewProblems, viewRenderCases } from './viewRender.ts';

export interface ViewContractOptions {
  /** View EN/DE catalogs; defaults to `packages/views/src/<id>/i18n/{en,de}.json`. */
  catalogs?: LocaleCatalogs;
  /** Fixture bundles to render against; defaults to every registered primitive run with its defaults. */
  fixtures?: () => Promise<NamedBundle[]>;
  /** Facets for kinds no fixture bundle emits (see `fixtureBundlesFor`). */
  fallbacks?: FallbackFacets;
}

/** React components are functions, or objects for `memo`/`forwardRef`/`lazy` wrappers. */
export function isComponentLike(value: unknown): boolean {
  return typeof value === 'function' || (typeof value === 'object' && value !== null && '$$typeof' in value);
}

let primitiveFixtures: Promise<NamedBundle[]> | undefined;

/** The real primitives' default bundles, generated once per test file. */
function defaultFixtures(): Promise<NamedBundle[]> {
  primitiveFixtures ??= primitiveFixtureBundles(primitiveManifests);
  return primitiveFixtures;
}

/**
 * Renders the view against every fixture bundle that serves it, in each locale, lens and at the
 * first/middle/last step: no render may throw or show a raw message key. Needs a DOM environment.
 */
function renderSuite<C>(manifest: ViewManifest<C>, options: ViewContractOptions): void {
  let View: ViewComponent;
  let sources: NamedBundle[];
  beforeAll(async () => {
    View = (await manifest.load()).default as ViewComponent;
    sources = await (options.fixtures ?? defaultFixtures)();
  });

  it('renders every fixture bundle in each locale, lens and at first/middle/last step without raw keys', () => {
    const selection = fixtureBundlesFor(manifest.requires, manifest.optional ?? [], sources, options.fallbacks);
    if (!selection.ok) throw new Error(`view "${manifest.id}": ${selection.problem}`);
    const problems = selection.bundles.flatMap(({ name, bundle }) => {
      const producerIds = name === ASSEMBLED ? sources.map((source) => source.name) : [name];
      return viewRenderCases(bundle).flatMap((renderCase) => renderViewProblems(View, bundle, renderCase, labMessages(renderCase.locale, producerIds)).map((problem) => `${name}: ${problem}`));
    });
    expect(problems).toEqual([]);
  });
}

/** Registers the generic contract suite for one view plugin (call at test-file top level, in a DOM environment). */
export function viewContract<C>(manifest: ViewManifest<C>, options: ViewContractOptions = {}): void {
  const catalogs = options.catalogs ?? loadPluginCatalogs('views', manifest.id);
  describe(`view "${manifest.id}" contract`, () => {
    it('has valid manifest basics and requires at least one facet', () => {
      expect(() => assertManifestBasics(manifest)).not.toThrow();
      expect(manifest.kind).toBe('view');
      expect(manifest.requires.length).toBeGreaterThan(0);
    });

    it('declares a title key present in EN and DE', () => expect(missingKeys([manifest.titleKey], catalogs)).toEqual([]));

    it('keeps every catalog key under view.<id>.*', () => expect(keysOutsideNamespace(catalogs, `view.${manifest.id}`)).toEqual([]));

    it('lazily loads a component', async () => {
      const module = await manifest.load();
      expect(isComponentLike(module.default)).toBe(true);
    });

    renderSuite(manifest, options);
  });
}
