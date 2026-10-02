import { defineView } from '@cryventure/core';
import type { ViewComponent } from '@cryventure/viz';

export default defineView<ViewComponent>({
  kind: 'view',
  id: 'narration',
  apiVersion: 1,
  titleKey: 'view.narration.title',
  icon: 'text',
  requires: ['narration'],
  optional: ['state'],
  defaultSlot: 'side',
  order: 20,
  narrowPlacement: 'caption',
  load: () => import('./NarrationView.tsx'),
});
