import type { DeriverManifest, Lens, Messages, PrimitiveManifest } from '@cryventure/core';
import type { LabProps } from '../islands/Lab.tsx';
import { viewsToShow } from '../islands/lab/labViews.ts';
import { labMessages } from '../labs/labMessages.ts';
import { deriversForFacets, resolveLab, viewsForProducer } from '../labs/registry.ts';
import { isLabMode, parseStartAt } from '../labs/startAt.ts';
import { isVariantName } from '../labs/variantName.ts';

/**
 * Server-side only: validates the options of a lab island wrapper (`Lab.astro`, `HeroLab.astro`) and
 * builds the island's props. Invalid options fail the build.
 */

/** The authoring options a lab wrapper passes through (see `Lab.astro`). */
export interface LabIslandOptions {
  labId: string;
  producerId: string;
  presetId?: string;
  layout?: string;
  lens?: Lens;
  startAt?: string;
  mode?: string;
  variant?: string;
  /** This lab's message table, when the page has already built it (`labMessages(lang, producer)`). */
  messages?: Messages;
}

export interface LabIslandSettings {
  /** The wrapper's tag in build errors (default `Lab`). */
  tag?: string;
  /** The island shows only the views `layout` names (`views="layout-only"`): ship only their `view.*` / `deriver.*` messages. */
  layoutViewsOnly?: boolean;
  /** Messages the wrapper's own island adds, e.g. the hero's `ui.hero.*`. */
  extraMessages?: Messages;
}

export interface LabIsland {
  producer: PrimitiveManifest;
  /** Props for the island (`Lab.tsx` or a wrapper of it); its poster goes in as children. */
  props: Omit<LabProps, 'children'>;
}

function validateOptions(options: LabIslandOptions, producer: PrimitiveManifest, fail: (message: string) => never): void {
  const { presetId, startAt, variant, mode } = options;
  if (presetId !== undefined && !producer.presets.some((entry) => entry.id === presetId)) fail(`unknown preset "${presetId}"`);
  if (startAt !== undefined && parseStartAt(startAt) === undefined) fail(`invalid startAt "${startAt}"`);
  if (variant !== undefined && !isVariantName(variant)) fail(`invalid variant "${String(variant)}" (expected lower-case tokens joined by - + or ., e.g. "x86_64-aesni")`);
  if (mode !== undefined && !isLabMode(mode)) fail(`unknown mode "${mode}"`);
}

/**
 * Drops the messages `labMessages` adds for views the island never shows: their `view.<id>.*`, and the
 * `deriver.<id>.*` of derivers that feed none of the shown views.
 */
export function withoutHiddenViewMessages(messages: Messages, producer: PrimitiveManifest, layout: string | undefined): Messages {
  const offered = viewsForProducer(producer);
  const shown = new Set(viewsToShow(offered, layout, 'layout-only'));
  const required = new Set([...shown].flatMap((view) => view.requires));
  const feedsShownView = (deriver: DeriverManifest) => deriver.provides.some((kind) => required.has(kind));
  const hiddenPrefixes = [
    ...offered.filter((view) => !shown.has(view)).map((view) => `view.${view.id}.`),
    ...deriversForFacets(producer.facets)
      .filter((deriver) => !feedsShownView(deriver))
      .map((deriver) => `deriver.${deriver.id}.`),
  ];
  return Object.fromEntries(Object.entries(messages).filter(([key]) => !hiddenPrefixes.some((prefix) => key.startsWith(prefix))));
}

/** Validates `options` and builds the island props: only this lab's messages, for `lang`. */
export function labIsland(options: LabIslandOptions, lang: string, settings: LabIslandSettings = {}): LabIsland {
  const { tag = 'Lab', layoutViewsOnly = false, extraMessages } = settings;
  const fail = (message: string): never => {
    throw new Error(`<${tag} labId="${options.labId}">: ${message}`);
  };
  const resolved = resolveLab(options.producerId);
  if (!resolved.ok) return fail(`unknown producer "${options.producerId}"`);
  const { producer } = resolved.lab;
  validateOptions(options, producer, fail);
  const { messages: givenMessages, mode, layout, ...rest } = options;
  const allMessages = givenMessages ?? labMessages(lang, producer);
  const messages = { ...(layoutViewsOnly ? withoutHiddenViewMessages(allMessages, producer, layout) : allMessages), ...extraMessages };
  return { producer, props: { ...rest, layout, mode: isLabMode(mode) ? mode : undefined, messages, locale: lang } };
}
