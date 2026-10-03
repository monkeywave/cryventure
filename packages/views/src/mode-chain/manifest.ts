import { defineView } from '@cryventure/core';
import type { ViewComponent } from '@cryventure/viz';

export default defineView<ViewComponent>({
  kind: 'view',
  id: 'mode-chain',
  apiVersion: 1,
  titleKey: 'view.mode-chain.title',
  icon: 'flow',
  requires: ['chain'],
  defaultSlot: 'main',
  order: 12,
  load: () => import('./ModeChainView.tsx'),
});
