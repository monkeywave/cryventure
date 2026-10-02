import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Messages } from '@cryventure/core';
import { REPO_ROOT } from '../fs/repoRoot.ts';

export const CONTRACT_LOCALES = ['en', 'de'] as const;
export type ContractLocale = (typeof CONTRACT_LOCALES)[number];
export type LocaleCatalogs = Record<ContractLocale, Messages>;

/** Plugin packages whose folders follow `packages/<package>/src/<id>/i18n/{en,de}.json`. */
export type PluginPackage = 'primitives' | 'protocols' | 'derivers' | 'views';

function readMessages(path: string): Messages {
  return existsSync(path) ? (JSON.parse(readFileSync(path, 'utf8')) as Messages) : {};
}

/** EN + DE catalogs of one plugin folder; a missing file yields an empty catalog (so key checks fail loudly). */
export function loadPluginCatalogs(pluginPackage: PluginPackage, id: string, root: string = REPO_ROOT): LocaleCatalogs {
  const file = (locale: ContractLocale) => join(root, 'packages', pluginPackage, 'src', id, 'i18n', `${locale}.json`);
  return { en: readMessages(file('en')), de: readMessages(file('de')) };
}
