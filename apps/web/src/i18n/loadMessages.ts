import { toLocale, type Locale, type Messages } from '@cryventure/core';

export { defaultLocale, isLocale, supportedLocales, toLocale, type Locale } from '@cryventure/core';
export type { Messages } from '@cryventure/core';

/** App dictionaries, keyed by "<locale>/<namespace>" (e.g. "de/ui"). Bundled at build time. */
const dictionaries = import.meta.glob<Messages>('./*/*.json', { eager: true, import: 'default' });

function dictionaryFor(locale: Locale, namespace: string): Messages {
  const messages = dictionaries[`./${locale}/${namespace}.json`];
  if (!messages) throw new Error(`Unknown i18n namespace "${namespace}" for locale "${locale}"`);
  return messages;
}

/**
 * Returns a flat key→string map containing only the requested namespaces of one locale.
 * Islands receive this as their `messages` prop so no other strings ship to the client.
 */
export function loadMessages(lang: string, namespaces: readonly string[]): Messages {
  const locale = toLocale(lang);
  return Object.assign({}, ...namespaces.map((namespace) => dictionaryFor(locale, namespace)));
}

/** Keeps only the keys under `prefix` (e.g. `quiz.question.`), so an island gets just the strings it uses. */
export function pickPrefix(messages: Messages, prefix: string): Messages {
  return Object.fromEntries(Object.entries(messages).filter(([key]) => key.startsWith(prefix)));
}
