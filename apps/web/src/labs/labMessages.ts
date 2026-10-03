import type { Messages, PrimitiveManifest } from '@cryventure/core';
import { loadCoreMessages } from '@cryventure/core/messages';
import { loadPrimitiveMessages } from '@cryventure/primitives/messages';
import { loadViewMessages } from '@cryventure/views/messages';
import { loadVizMessages } from '@cryventure/viz/messages';
import { loadMessages, pickPrefix, toLocale } from '../i18n/loadMessages.ts';
import { viewsForFacets } from './registry.ts';

/**
 * Server-side only: assembles the exact message table one lab island needs for one locale,
 * so no other namespace or locale ships to the client (docs/PLAN.md §5).
 */

/** The lab-related part of the app's `ui` namespace. */
export const APP_LAB_PREFIX = 'ui.lab.';

/**
 * The lab's producer, as far as its messages are concerned: catalog folder `id`, key namespace
 * `i18nNamespace`, and the `facets` that decide which views (and so which `view.*` keys) the lab offers.
 */
export type LabMessagesProducer = Pick<PrimitiveManifest, 'id' | 'i18nNamespace' | 'facets'>;

/** The `view.<id>.*` messages of the views this producer can feed (the lab's `viewsFor` selection). */
function offeredViewMessages(locale: string, producer: LabMessagesProducer): Messages {
  const all = loadViewMessages(locale);
  return Object.assign({}, ...viewsForFacets(producer.facets).map((view) => pickPrefix(all, `view.${view.id}.`)));
}

/** viz `ui.*` + offered views' `view.*` + app `ui.lab.*` + `core.*` errors + the producer's own `i18nNamespace`. */
export function labMessages(lang: string | undefined, producer: LabMessagesProducer): Messages {
  const locale = toLocale(lang);
  return {
    ...loadVizMessages(locale),
    ...offeredViewMessages(locale, producer),
    ...pickPrefix(loadMessages(locale, ['ui']), APP_LAB_PREFIX),
    ...loadCoreMessages(locale),
    ...pickPrefix(loadPrimitiveMessages(producer.id, locale), `${producer.i18nNamespace}.`),
  };
}
