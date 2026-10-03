import { mergeCatalogs, toLocale, type Messages } from '@cryventure/core';

/**
 * Server-side catalog access (`@cryventure/derivers/messages`): kept out of the package index so
 * `deriverManifests` never pulls message JSON into the client bundle.
 */
const catalogModules = import.meta.glob<Messages>('./*/i18n/*.json', { eager: true, import: 'default' });

/** Merged `deriver.*` catalogs of every deriver, in one locale. */
export function loadDeriverMessages(lang?: string): Messages {
  return mergeCatalogs(catalogModules, toLocale(lang));
}
