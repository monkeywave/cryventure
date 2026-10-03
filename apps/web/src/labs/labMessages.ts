import { portNamespaces, type Messages, type PrimitiveManifest } from '@cryventure/core';
import { loadCoreMessages } from '@cryventure/core/messages';
import { loadPrimitiveMessages } from '@cryventure/primitives/messages';
import { loadViewMessages } from '@cryventure/views/messages';
import { loadVizMessages } from '@cryventure/viz/messages';
import { loadMessages, pickPrefix, toLocale } from '../i18n/loadMessages.ts';
import { producerRegistry, viewsForFacets } from './registry.ts';

/**
 * Server-side only: assembles the exact message table one lab island needs for one locale,
 * so no other namespace or locale ships to the client (docs/PLAN.md §5).
 */

/** The lab-related part of the app's `ui` namespace. */
export const APP_LAB_PREFIX = 'ui.lab.';

/**
 * The lab's producer, as far as its messages are concerned: catalog folder `id`, key namespace
 * `i18nNamespace`, the `facets` that decide which views (and so which `view.*` keys) the lab offers,
 * and its param fields (`paramFields` / `defaults`), whose `port` params name other producers.
 */
export type LabMessagesProducer = Pick<PrimitiveManifest, 'id' | 'i18nNamespace' | 'facets' | 'paramFields' | 'defaults'>;

/** The `view.<id>.*` messages of the views this producer can feed (the lab's `viewsFor` selection). */
function offeredViewMessages(locale: string, producer: LabMessagesProducer): Messages {
  const all = loadViewMessages(locale);
  return Object.assign({}, ...viewsForFacets(producer.facets).map((view) => pickPrefix(all, `view.${view.id}.`)));
}

/** A producer's own `i18nNamespace` messages. */
function producerMessages(locale: string, producer: Pick<PrimitiveManifest, 'id' | 'i18nNamespace'>): Messages {
  return pickPrefix(loadPrimitiveMessages(producer.id, locale), `${producer.i18nNamespace}.`);
}

/**
 * The namespaces of every producer a `port` param can name (docs/M3.md §2): the learner can switch
 * the cipher on the client, so the server cannot know which one ends up resolved.
 */
function portProducerMessages(locale: string, producer: LabMessagesProducer): Messages {
  const registered = producerRegistry.list();
  const namespaces = new Set(portNamespaces(producer, registered));
  const options = registered.filter((candidate) => namespaces.has(candidate.i18nNamespace));
  return Object.assign({}, ...options.map((option) => producerMessages(locale, option)));
}

/** viz `ui.*` + offered views' `view.*` + app `ui.lab.*` + `core.*` errors + port options' namespaces + the producer's own `i18nNamespace`. */
export function labMessages(lang: string | undefined, producer: LabMessagesProducer): Messages {
  const locale = toLocale(lang);
  return {
    ...loadVizMessages(locale),
    ...offeredViewMessages(locale, producer),
    ...pickPrefix(loadMessages(locale, ['ui']), APP_LAB_PREFIX),
    ...loadCoreMessages(locale),
    ...portProducerMessages(locale, producer),
    ...producerMessages(locale, producer),
  };
}
