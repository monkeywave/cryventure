import { createTranslator, toLocale, type Translate } from '@cryventure/core';
import { loadMessages } from '../../i18n/loadMessages';

/** Translator for the `lens` namespace (lens selector and `<Lens>` badges are rendered on the server). */
export function lensTranslator(lang: string | undefined): Translate {
  const locale = toLocale(lang);
  return createTranslator(loadMessages(locale, ['lens']), { locale });
}
