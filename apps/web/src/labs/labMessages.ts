import { portNamespaces, type Messages, type PrimitiveManifest } from '@cryventure/core';
import { loadCoreMessages } from '@cryventure/core/messages';
import { loadDeriverMessages } from '@cryventure/derivers/messages';
import { loadPrimitiveMessages } from '@cryventure/primitives/messages';
import { loadViewMessages } from '@cryventure/views/messages';
import { loadVizMessages } from '@cryventure/viz/messages';
import { loadMessages, pickPrefix, toLocale } from '../i18n/loadMessages.ts';
import { deriversForFacets, producerRegistry, viewRegistry, viewsForProducer } from './registry.ts';
import { sampleApplicableDerivers } from './sampleDerivers.ts';

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

/**
 * The derivers this lab can use: those applicable to a sample run of the producer
 * (`sampleApplicableDerivers`), or, for a producer outside the registry, every deriver its declared
 * facets can feed (`deriversForFacets`).
 */
function offeredDerivers(producer: LabMessagesProducer) {
  return deriversForFacets(producer.facets, sampleApplicableDerivers(producer.id));
}

/** The `view.<id>.*` messages of the views this producer can feed, directly or via an offered deriver. */
function offeredViewMessages(locale: string, producer: LabMessagesProducer): Messages {
  const all = loadViewMessages(locale);
  const views = viewsForProducer(producer, viewRegistry, offeredDerivers(producer));
  return Object.assign({}, ...views.map((view) => pickPrefix(all, `view.${view.id}.`)));
}

/** The `deriver.<id>.*` messages of the offered derivers. */
function offeredDeriverMessages(locale: string, producer: LabMessagesProducer): Messages {
  const all = loadDeriverMessages(locale);
  return Object.assign({}, ...offeredDerivers(producer).map((deriver) => pickPrefix(all, `deriver.${deriver.id}.`)));
}

/** A producer's own `i18nNamespace` messages. */
function producerMessages(locale: string, producer: Pick<PrimitiveManifest, 'id' | 'i18nNamespace'>): Messages {
  return pickPrefix(loadPrimitiveMessages(producer.id, locale), `${producer.i18nNamespace}.`);
}

/**
 * The namespaces of every producer a `port` param can name (docs/M3.md §2): the learner can switch
 * the cipher on the client, so the server cannot know which one ends up resolved. A member field's
 * option labels (docs/M7.md §1b) live in their producers' namespaces, so they are covered too.
 */
function portProducerMessages(locale: string, producer: LabMessagesProducer, registered: readonly PrimitiveManifest[]): Messages {
  const namespaces = new Set(portNamespaces(producer, registered));
  const options = registered.filter((candidate) => namespaces.has(candidate.i18nNamespace));
  return Object.assign({}, ...options.map((option) => producerMessages(locale, option)));
}

/**
 * viz `ui.*` + offered views' `view.*` + offered derivers' `deriver.*` + app `ui.lab.*` + `core.*`
 * errors + port options' namespaces (among `registered`, default: the app's registry) + the
 * producer's own `i18nNamespace`.
 */
export function labMessages(lang: string | undefined, producer: LabMessagesProducer, registered: readonly PrimitiveManifest[] = producerRegistry.list()): Messages {
  const locale = toLocale(lang);
  return {
    ...loadVizMessages(locale),
    ...offeredViewMessages(locale, producer),
    ...offeredDeriverMessages(locale, producer),
    ...pickPrefix(loadMessages(locale, ['ui']), APP_LAB_PREFIX),
    ...loadCoreMessages(locale),
    ...portProducerMessages(locale, producer, registered),
    ...producerMessages(locale, producer),
  };
}
