import { mergeCatalogs, toLocale, type Messages } from '@cryventure/core';

/**
 * Server-side catalog access (`@cryventure/primitives/messages`): kept out of the package index
 * so no message JSON reaches the client bundle through the manifests.
 */
const catalogModules = import.meta.glob<Messages>('./*/i18n/*.json', { eager: true, import: 'default' });

/** The `plugin.<id>.*` catalog of primitive `id` in one locale; empty when the plugin has none. */
export function loadPrimitiveMessages(id: string, lang?: string): Messages {
  return mergeCatalogs(catalogModules, toLocale(lang), id);
}
