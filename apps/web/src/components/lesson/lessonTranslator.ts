import { createTranslator, type Translate } from '@cryventure/core';
import { loadMessages } from '../../i18n/loadMessages';

/** Translator for the `lesson` namespace of the given page locale (lesson components are server-only). */
export function lessonTranslator(lang: string | undefined): Translate {
  const locale = lang ?? 'en';
  return createTranslator(loadMessages(locale, ['lesson']), { locale });
}
