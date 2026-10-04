import { toLocale, type ProducerLookup } from '@cryventure/core';
import type { BlockLabHrefBuilder, LabHrefBuilder, LabTitleLookup } from '@cryventure/viz';
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
 * A link to the standalone lab of `producerId` opened with `params` (and `step`); `undefined` when it cannot link.
 * `step` is for callers opening the lab at a position (the deep link's `s=`); zoom links (`createLabHref`,
 * `createBlockLabHref`) open the lab at its start and leave it out.
 */
export type LabLinkBuilder = (producerId: string, params: unknown, step?: number) => string | undefined;

/**
 * The web app's link to a standalone lab (docs/M3.md §5): `<base><lang>/lab/<id>/#lab=<id>&p=…`,
 * a deep link the standalone lab (whose `labId` is the producer id) opens with `params` and `step`.
 * `undefined` for an unregistered producer or a hash the lab would reject as too long.
 */
export function createLabLink({ base, lang, producers = producerRegistry }: LabHrefContext): LabLinkBuilder {
  const locale = toLocale(lang);
  return (producerId, params, step) => {
    if (producers.get(producerId) === undefined) return undefined;
    const state: LabLinkState = step === undefined ? { params } : { params, step };
    const hash = encodeLabStates(new Map([[producerId, state]]));
    if (hash.length + 1 > MAX_HASH_LENGTH) return undefined;
    return `${joinBase(base, labRoutePath(locale, producerId))}#${hash}`;
  };
}

/**
 * `useLabActions().labHref` for the web app (docs/M7.md §4): the standalone lab of a view's zoom
 * target (`LabZoom`, e.g. a derivation node's "Open in the HMAC lab"), via `createLabLink`.
 */
export function createLabHref(context: LabHrefContext): LabHrefBuilder {
  const labLink = createLabLink(context);
  return ({ producerId, params }) => labLink(producerId, params);
}

/**
 * `useLabActions().blockLabHref` for the web app: the cipher's own lab encrypting one block, with the
 * params its manifest names (`blockLabParams`). `undefined` when the manifest has no such hook (or
 * `createLabLink` cannot link).
 */
export function createBlockLabHref(context: LabHrefContext): BlockLabHrefBuilder {
  const { producers = producerRegistry } = context;
  const labLink = createLabLink(context);
  return (producerId, keyHex, blockHex) => {
    const params = producers.get(producerId)?.blockLabParams?.(keyHex, blockHex);
    return params === undefined ? undefined : labLink(producerId, params);
  };
}

/**
 * `useLabActions().labTitle` for the web app: the title key of a registered producer's lab (its
 * manifest's `titleKey`), so a zoom link can say which lab it opens ("Open the lab “HMAC …”").
 */
export function createLabTitle(producers: ProducerLookup = producerRegistry): LabTitleLookup {
  return (producerId) => producers.get(producerId)?.titleKey;
}
