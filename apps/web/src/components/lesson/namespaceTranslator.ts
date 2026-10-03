import { createTranslator, toLocale, type Translate } from '@cryventure/core';
import { loadMessages } from '../../i18n/loadMessages';

/**
 * Translator for one message namespace of the given page locale, for server-rendered components
 * (e.g. `lesson` for lesson components, `lens` for the lens selector and `<Lens>` badges).
 */
export function namespaceTranslator(lang: string | undefined, namespace: string): Translate {
  const locale = toLocale(lang);
  return createTranslator(loadMessages(locale, [namespace]), { locale });
}
