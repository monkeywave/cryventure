import { toLocale, type Locale, type Messages } from '@cryventure/core';
import de from './de.json' with { type: 'json' };
import en from './en.json' with { type: 'json' };

/**
 * The viz `ui.*` catalogs per locale (`@cryventure/viz/messages`, server side / tests).
 * Not re-exported from the package index, so lab islands never bundle them.
 */
export const vizMessages: Readonly<Record<Locale, Messages>> = { en, de };

/** The viz `ui.*` catalog of one locale; merge it into the `messages` passed to a lab. */
export function loadVizMessages(lang?: string): Messages {
  return vizMessages[toLocale(lang)];
}
