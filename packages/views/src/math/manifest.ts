import { defineView } from '@cryventure/core';
import type { ViewComponent } from '@cryventure/viz';

export default defineView<ViewComponent>({
  kind: 'view',
  id: 'math',
  apiVersion: 1,
  titleKey: 'view.math.title',
  icon: 'grid',
  requires: ['math'],
  defaultSlot: 'side',
  order: 100,
  load: () => import('./MathView.tsx'),
});
