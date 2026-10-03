import { defineView } from '@cryventure/core';
import type { ViewComponent } from '@cryventure/viz';

export default defineView<ViewComponent>({
  kind: 'view',
  id: 'wire',
  apiVersion: 1,
  titleKey: 'view.wire.title',
  icon: 'bytes',
  requires: ['wire'],
  defaultSlot: 'side',
  order: 25,
  load: () => import('./WireView.tsx'),
});
