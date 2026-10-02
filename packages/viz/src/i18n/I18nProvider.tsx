import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { createTranslator, type Messages, type Translate } from '@cryventure/core';

/** Without a provider every key renders as itself, which keeps missing wiring visible. */
const I18nContext = createContext<Translate>(createTranslator({}));

export interface I18nProviderProps {
  /** Flat key → template table for the current locale (only the namespaces this lab needs). */
  messages: Messages;
  /** Page locale; selects plural forms (`<key>_one` / `<key>_other`). Default `en`. */
  locale?: string;
  children: ReactNode;
}

export function I18nProvider({ messages, locale, children }: I18nProviderProps) {
  const translate = useMemo(() => createTranslator(messages, { locale }), [messages, locale]);
  return <I18nContext.Provider value={translate}>{children}</I18nContext.Provider>;
}

/** The current `t(key | ref, params)`. */
export function useT(): Translate {
  return useContext(I18nContext);
}
