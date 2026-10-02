import { defineView } from '@cryventure/core';
import type { ViewComponent } from '@cryventure/viz';

export default defineView<ViewComponent>({
  kind: 'view',
  id: 'state',
  apiVersion: 1,
  titleKey: 'view.state.title',
  icon: 'grid',
  requires: ['state'],
  defaultSlot: 'main',
  order: 10,
  load: () => import('./StateView.tsx'),
});
