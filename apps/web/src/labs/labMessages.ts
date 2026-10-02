import type { Messages } from '@cryventure/core';
import { loadCoreMessages } from '@cryventure/core/messages';
import { loadPrimitiveMessages } from '@cryventure/primitives/messages';
import { loadViewMessages } from '@cryventure/views/messages';
import { loadVizMessages } from '@cryventure/viz/messages';
import { loadMessages, toLocale } from '../i18n/loadMessages.ts';

/**
 * Server-side only: assembles the exact message table one lab island needs for one locale,
 * so no other namespace or locale ships to the client (docs/PLAN.md §5).
 */

/** The lab-related part of the app's `ui` namespace. */
export const APP_LAB_PREFIX = 'ui.lab.';

export function pickPrefix(messages: Messages, prefix: string): Messages {
  return Object.fromEntries(Object.entries(messages).filter(([key]) => key.startsWith(prefix)));
}

/** viz `ui.*` + views `view.*` + app `ui.lab.*` + `core.*` errors + the producer's `plugin.<id>.*`. */
export function labMessages(lang: string | undefined, producerId: string): Messages {
  const locale = toLocale(lang);
  return {
    ...loadVizMessages(locale),
    ...loadViewMessages(locale),
    ...pickPrefix(loadMessages(locale, ['ui']), APP_LAB_PREFIX),
    ...loadCoreMessages(locale),
    ...loadPrimitiveMessages(producerId, locale),
  };
}
