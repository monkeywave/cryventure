import { useId, useState, type KeyboardEvent } from 'react';
import { useT } from '../i18n/I18nProvider.tsx';
import { ViewHost } from './ViewHost.tsx';
import type { ReactViewManifest, ViewProps } from './viewTypes.ts';

export interface TabbedViewsProps extends ViewProps {
  manifests: readonly ReactViewManifest[];
}

const TAB_STEPS: Readonly<Record<string, (index: number, count: number) => number>> = {
  ArrowLeft: (index, count) => (index - 1 + count) % count,
  ArrowRight: (index, count) => (index + 1) % count,
  Home: () => 0,
  End: (_index, count) => count - 1,
};

/** Several views in one panel as an ARIA tablist; only the active view is mounted (and loaded). */
export function TabbedViews({ manifests, labId, lens }: TabbedViewsProps) {
  const t = useT();
  const baseId = useId();
  const [activeIndex, setActiveIndex] = useState(0);
  const active = manifests[activeIndex] ?? manifests[0];
  const tabId = (index: number) => `${baseId}-tab-${index}`;

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const step = TAB_STEPS[event.key];
    if (step === undefined) return;
    event.preventDefault();
    const next = step(activeIndex, manifests.length);
    setActiveIndex(next);
    document.getElementById(tabId(next))?.focus();
  };

  if (active === undefined) return null;
  return (
    <div className="cv-tabs">
      <div role="tablist" className="cv-tabs__list" aria-label={t('ui.workspace.views')} onKeyDown={onKeyDown}>
        {manifests.map((manifest, index) => (
          <button
            key={manifest.id}
            id={tabId(index)}
            type="button"
            role="tab"
            className="cv-tabs__tab"
            aria-selected={index === activeIndex}
            aria-controls={`${baseId}-panel`}
            tabIndex={index === activeIndex ? 0 : -1}
            onClick={() => setActiveIndex(index)}
          >
            {t(manifest.titleKey)}
          </button>
        ))}
      </div>
      <div role="tabpanel" id={`${baseId}-panel`} className="cv-tabs__panel" aria-labelledby={tabId(activeIndex)}>
        <ViewHost key={active.id} manifest={active} labId={labId} lens={lens} />
      </div>
    </div>
  );
}
