import de from '../i18n/de.json' with { type: 'json' };
import en from '../i18n/en.json' with { type: 'json' };
import type { Messages } from './i18n.ts';
import { toLocale, type Locale } from './locale.ts';

const coreCatalogs: Readonly<Record<Locale, Messages>> = { en, de };

/** The `core.*` catalog (e.g. hex parse errors) of one locale; server-side, so only it ships. */
export function loadCoreMessages(lang?: string): Messages {
  return coreCatalogs[toLocale(lang)];
}
