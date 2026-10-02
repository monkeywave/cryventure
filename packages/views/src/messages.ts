import { mergeCatalogs, toLocale, type Messages } from '@cryventure/core';

/**
 * Server-side catalog access (`@cryventure/views/messages`): kept out of the package index so
 * `viewManifests` (imported by lab islands) never pulls message JSON into the client bundle.
 */
const catalogModules = import.meta.glob<Messages>('./*/i18n/*.json', { eager: true, import: 'default' });

/** Merged `view.*` catalogs of every view, in one locale. */
export function loadViewMessages(lang?: string): Messages {
  return mergeCatalogs(catalogModules, toLocale(lang));
}
