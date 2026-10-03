import { supportedLocales, type Lens, type Locale, type Messages, type TraceBundle } from '@cryventure/core';
import { loadCoreMessages } from '@cryventure/core/messages';
import { loadDeriverMessages } from '@cryventure/derivers/messages';
import { loadPrimitiveMessages } from '@cryventure/primitives/messages';
import { loadViewMessages } from '@cryventure/views/messages';
import { createLabStore, type ViewComponent } from '@cryventure/viz';
import { loadVizMessages } from '@cryventure/viz/messages';
import { renderViewLab } from '@cryventure/viz/testing';
import { representativeSteps } from './facetFixtures.ts';

/** Every lens a view may be shown in (core `Lens`). */
export const LENSES: readonly Lens[] = ['story', 'engineer', 'cryptographer'];

/** An untranslated message key leaking into the DOM, e.g. `view.state.title`, `plugin.aes.op.sub` or `deriver.memory.label`. */
export const RAW_KEY_PATTERN = /\b(?:view|plugin|deriver|ui|core)\.[a-z0-9-]+\.[A-Za-z0-9.-]*[A-Za-z0-9]/g;

const TEXT_ATTRIBUTES = ['aria-label', 'aria-description', 'aria-valuetext', 'title', 'alt', 'placeholder'];

/** The data of every text node under `root` (scanned separately, so adjacent nodes never merge into one match). */
function textNodeData(root: Element): string[] {
  const walker = root.ownerDocument.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const texts: string[] = [];
  for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) texts.push(node.nodeValue ?? '');
  return texts;
}

/** Raw message keys in an element's text and accessible-text attributes. */
export function rawKeysIn(root: Element): string[] {
  const attributeTexts = [...root.querySelectorAll('*')].flatMap((element) => TEXT_ATTRIBUTES.map((name) => element.getAttribute(name) ?? ''));
  const texts = [...textNodeData(root), ...attributeTexts];
  return [...new Set(texts.flatMap((text) => text.match(RAW_KEY_PATTERN) ?? []))];
}

/** The catalogs a lab of `producerIds` loads in `locale` (viz, views, core, every deriver's and the producers' plugin keys). */
export function labMessages(locale: Locale, producerIds: readonly string[]): Messages {
  const plugins = producerIds.map((id) => loadPrimitiveMessages(id, locale));
  return Object.assign({}, loadVizMessages(locale), loadViewMessages(locale), loadCoreMessages(locale), loadDeriverMessages(locale), ...plugins);
}

/** The lens a view that declares no `lenses` is rendered in: the most detailed one. */
const SINGLE_LENS: Lens = 'cryptographer';

/**
 * The lenses a view is rendered in: all of them when its manifest declares `lenses` (it adapts to
 * the lens), else once, in the most detailed lens.
 */
export function lensesToRender(declared: readonly Lens[] | undefined): readonly Lens[] {
  return declared !== undefined && declared.length > 0 ? LENSES : [SINGLE_LENS];
}

export interface ViewRenderCase {
  locale: Locale;
  lens: Lens;
  step: number;
}

/** Every locale × lens (default: all) × representative step (first, middle, last) of `bundle`. */
export function viewRenderCases(bundle: TraceBundle, lenses: readonly Lens[] = LENSES): ViewRenderCase[] {
  const store = createLabStore(bundle);
  store.getState().last();
  const steps = representativeSteps(store.getState().step);
  return supportedLocales.flatMap((locale) => lenses.flatMap((lens) => steps.map((step) => ({ locale, lens, step }))));
}

/** Renders `View` at one case and returns the raw keys it shows (rendering errors throw). */
export function renderViewProblems(View: ViewComponent, bundle: TraceBundle, renderCase: ViewRenderCase, messages: Messages): string[] {
  const store = createLabStore(bundle);
  store.getState().seek(renderCase.step);
  const { container, unmount } = renderViewLab(View, { labId: 'contract', lens: renderCase.lens }, { store, messages });
  const rawKeys = rawKeysIn(container);
  unmount();
  return rawKeys.map((key) => `raw i18n key "${key}" at ${renderCase.locale}/${renderCase.lens}/step ${renderCase.step}`);
}
