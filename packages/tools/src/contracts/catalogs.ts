import { join } from 'node:path';
import { supportedLocales, type Locale, type Messages } from '@cryventure/core';
import { REPO_ROOT } from '../fs/repoRoot.ts';
import { readCatalogFile } from '../i18n/catalogFile.ts';

/** Locales every plugin catalog must provide: core's `supportedLocales` (kept as an alias for existing imports). */
export const CONTRACT_LOCALES: readonly Locale[] = supportedLocales;
export type ContractLocale = Locale;
export type LocaleCatalogs = Record<ContractLocale, Messages>;

/** Plugin packages whose folders follow `packages/<package>/src/<id>/i18n/{en,de}.json`. */
export type PluginPackage = 'primitives' | 'protocols' | 'derivers' | 'views';

/** Catalogs of one plugin folder per supported locale; a missing file yields an empty catalog (so key checks fail loudly). */
export function loadPluginCatalogs(pluginPackage: PluginPackage, id: string, root: string = REPO_ROOT): LocaleCatalogs {
  const file = (locale: Locale) => join(root, 'packages', pluginPackage, 'src', id, 'i18n', `${locale}.json`);
  const entries = supportedLocales.map((locale) => [locale, readCatalogFile(file(locale)) as Messages] as const);
  return Object.fromEntries(entries) as LocaleCatalogs;
}
