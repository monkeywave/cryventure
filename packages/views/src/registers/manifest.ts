import { defineView } from '@cryventure/core';
import type { ViewComponent } from '@cryventure/viz';

export default defineView<ViewComponent>({
  kind: 'view',
  id: 'registers',
  apiVersion: 1,
  titleKey: 'view.registers.title',
  icon: 'grid',
  requires: ['registers'],
  defaultSlot: 'side',
  order: 32,
  load: () => import('./RegistersView.tsx'),
});
