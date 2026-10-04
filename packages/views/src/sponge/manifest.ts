import { defineView } from '@cryventure/core';
import type { ViewComponent } from '@cryventure/viz';

export default defineView<ViewComponent>({
  kind: 'view',
  id: 'sponge',
  apiVersion: 1,
  titleKey: 'view.sponge.title',
  icon: 'grid',
  requires: ['sponge'],
  lenses: ['story', 'engineer', 'cryptographer'],
  defaultSlot: 'main',
  order: 11,
  load: () => import('./SpongeView.tsx'),
});
