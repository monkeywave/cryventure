import { defineView } from '@cryventure/core';
import type { ViewComponent } from '@cryventure/viz';

export default defineView<ViewComponent>({
  kind: 'view',
  id: 'wordops',
  apiVersion: 1,
  titleKey: 'view.wordops.title',
  icon: 'grid',
  requires: ['wordops'],
  optional: ['values'],
  lenses: ['story', 'engineer', 'cryptographer'],
  defaultSlot: 'side',
  order: 101,
  load: () => import('./WordopsView.tsx'),
});
