import { toLocale, type ProducerLookup } from '@cryventure/core';
import type { LabHrefBuilder } from '@cryventure/viz';
import { joinBase } from '../lib/withBase.ts';
import { encodeLabStates, MAX_HASH_LENGTH, type LabLinkState } from './deepLink.ts';
import { producerRegistry } from './producers.ts';

export interface LabHrefContext {
  /** The site base (`import.meta.env.BASE_URL`). */
  base: string;
  /** The page language; unsupported tags fall back like everywhere else (`toLocale`). */
  lang: string | undefined;
  producers?: ProducerLookup;
}

/** Path of the standalone lab route `src/pages/[lang]/lab/[id].astro`, without the base. */
export const labRoutePath = (lang: string, producerId: string): string => `${lang}/lab/${producerId}/`;

/**
 * `useLabActions().labHref` for the web app (docs/M3.md §5): `<base><lang>/lab/<id>/#lab=<id>&p=…`,
 * a deep link the standalone lab (whose `labId` is the producer id) opens with `params` and `step`.
 * `undefined` for an unregistered producer or a hash the lab would reject as too long.
 */
export function createLabHref({ base, lang, producers = producerRegistry }: LabHrefContext): LabHrefBuilder {
  const locale = toLocale(lang);
  return (producerId, params, step) => {
    if (producers.get(producerId) === undefined) return undefined;
    const state: LabLinkState = step === undefined ? { params } : { params, step };
    const hash = encodeLabStates(new Map([[producerId, state]]));
    if (hash.length + 1 > MAX_HASH_LENGTH) return undefined;
    return `${joinBase(base, labRoutePath(locale, producerId))}#${hash}`;
  };
}
