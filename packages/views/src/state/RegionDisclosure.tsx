import { useId, type ReactNode } from 'react';
import type { RegionSpec } from '@cryventure/core';
import { useLab, useLabActions, useLabLayout, useT } from '@cryventure/viz';
import { regionByteSize } from './regionLayout.ts';

/** The learner's choice wins; otherwise collapsed on narrow labs and expanded on wide ones. */
function useRegionExpanded(regionId: string): [boolean, (expanded: boolean) => void] {
  const { narrow } = useLabLayout();
  const choice = useLab((state) => state.regionsExpanded[regionId]);
  const { setRegionExpanded } = useLabActions();
  return [choice ?? !narrow, (expanded) => setRegionExpanded(regionId, expanded)];
}

export interface RegionDisclosureProps {
  region: RegionSpec<string>;
  children: ReactNode;
}

/** A large region behind a disclosure button ("Key schedule w[i] · 176 bytes"); its cells render only while expanded. */
export function RegionDisclosure({ region, children }: RegionDisclosureProps) {
  const t = useT();
  const contentId = useId();
  const [expanded, setExpanded] = useRegionExpanded(region.id);
  return (
    <div className="cv-region-disclosure" data-region-disclosure={region.id}>
      <button type="button" className="cv-region-disclosure__toggle" aria-expanded={expanded} aria-controls={contentId} onClick={() => setExpanded(!expanded)}>
        <span className="cv-region-disclosure__marker" aria-hidden="true" />
        {t('view.state.region.summary', { region: t(region.labelKey), bytes: regionByteSize(region) })}
      </button>
      <div id={contentId} hidden={!expanded}>
        {expanded && children}
      </div>
    </div>
  );
}
