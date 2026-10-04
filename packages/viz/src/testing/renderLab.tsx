import { render, type RenderResult } from '@testing-library/react';
import type { ReactNode } from 'react';
import type { Messages, TraceBundle } from '@cryventure/core';
import { I18nProvider } from '../i18n/I18nProvider.tsx';
import { createLabStore, type BlockLabHrefBuilder, type LabHrefBuilder, type LabStore, type LabTitleLookup, type ParamsRequestHandler } from '../lab/createLabStore.ts';
import { LabRoot } from '../lab/LabRoot.tsx';
import { vizMessages } from '../i18n/messages.ts';
import type { OpLabelMap } from '../player/opLabel.ts';
import type { ViewComponent, ViewProps } from '../workspace/viewTypes.ts';

export interface RenderLabOptions {
  bundle?: TraceBundle | null;
  messages?: Messages;
  store?: LabStore;
  /** The producer's op labels (`manifest.ops`), as `LabRoot` receives them. */
  opLabels?: OpLabelMap;
  /** The host's re-run handler behind `useLabActions().requestParams`, as `LabRoot` receives it. */
  onRequestParams?: ParamsRequestHandler;
  /** The host's link builder behind `useLabActions().labHref` (ignored when `store` is given). */
  labHref?: LabHrefBuilder;
  /** The host's zoom link builder behind `useLabActions().blockLabHref` (ignored when `store` is given). */
  blockLabHref?: BlockLabHrefBuilder;
  /** The host's lab title lookup behind `useLabActions().labTitle` (ignored when `store` is given). */
  labTitle?: LabTitleLookup;
}

/** Renders `ui` inside a full lab (i18n + store + keyboard + motion) for component tests. */
export function renderLab(ui: ReactNode, options: RenderLabOptions = {}): RenderResult & { store: LabStore } {
  const store = options.store ?? createLabStore(options.bundle ?? null, { labHref: options.labHref, blockLabHref: options.blockLabHref, labTitle: options.labTitle });
  const result = render(
    <I18nProvider messages={{ ...vizMessages.en, ...options.messages }}>
      <LabRoot store={store} opLabels={options.opLabels} onRequestParams={options.onRequestParams}>
        {ui}
      </LabRoot>
    </I18nProvider>,
  );
  return { ...result, store };
}

/** Renders one view component inside a full lab, as a workspace slot would; for callers without JSX (e.g. the contract kit). */
export function renderViewLab(View: ViewComponent, props: ViewProps, options: RenderLabOptions = {}): RenderResult & { store: LabStore } {
  return renderLab(<View {...props} />, options);
}
