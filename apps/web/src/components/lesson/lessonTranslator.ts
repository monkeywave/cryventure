import { createTranslator, toLocale, type Translate } from '@cryventure/core';
import { loadMessages } from '../../i18n/loadMessages';

/** Translator for the `lesson` namespace of the given page locale (lesson components are server-only). */
export function lessonTranslator(lang: string | undefined): Translate {
  const locale = toLocale(lang);
  return createTranslator(loadMessages(locale, ['lesson']), { locale });
}
