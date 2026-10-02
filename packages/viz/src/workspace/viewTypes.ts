import type { ComponentType } from 'react';
import type { Lens, ViewManifest } from '@cryventure/core';

/**
 * Props every view receives. Everything else (playhead, facets, selection, `t`) comes from
 * hooks: `useLab`, `useFacet`, `useT`.
 */
export interface ViewProps {
  labId: string;
  lens: Lens;
}

export type ViewComponent = ComponentType<ViewProps>;
export type ReactViewManifest = ViewManifest<ViewComponent>;
