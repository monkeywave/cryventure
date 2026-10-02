import { assertManifestBasics, type ViewManifest } from '@cryventure/core';
import { describe, expect, it } from 'vitest';
import { loadPluginCatalogs, type LocaleCatalogs } from './catalogs.ts';
import { keysOutsideNamespace, missingKeys } from './checks.ts';

export interface ViewContractOptions {
  /** View EN/DE catalogs; defaults to `packages/views/src/<id>/i18n/{en,de}.json`. */
  catalogs?: LocaleCatalogs;
}

/** React components are functions, or objects for `memo`/`forwardRef`/`lazy` wrappers. */
export function isComponentLike(value: unknown): boolean {
  return typeof value === 'function' || (typeof value === 'object' && value !== null && '$$typeof' in value);
}

/** Registers the generic contract suite for one view plugin (call at test-file top level). */
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
  });
}
