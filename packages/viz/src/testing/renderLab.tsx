import { render, type RenderResult } from '@testing-library/react';
import type { ReactNode } from 'react';
import type { Messages, TraceBundle } from '@cryventure/core';
import { I18nProvider } from '../i18n/I18nProvider.tsx';
import { createLabStore, type LabStore } from '../lab/createLabStore.ts';
import { LabRoot } from '../lab/LabRoot.tsx';
import { vizMessages } from '../i18n/messages.ts';

export interface RenderLabOptions {
  bundle?: TraceBundle | null;
  messages?: Messages;
  store?: LabStore;
}

/** Renders `ui` inside a full lab (i18n + store + keyboard + motion) for component tests. */
export function renderLab(ui: ReactNode, options: RenderLabOptions = {}): RenderResult & { store: LabStore } {
  const store = options.store ?? createLabStore(options.bundle ?? null);
  const result = render(
    <I18nProvider messages={{ ...vizMessages.en, ...options.messages }}>
      <LabRoot store={store}>{ui}</LabRoot>
    </I18nProvider>,
  );
  return { ...result, store };
}
