import { defineView } from '@cryventure/core';
import type { ViewComponent } from '@cryventure/viz';

export default defineView<ViewComponent>({
  kind: 'view',
  id: 'derivation',
  apiVersion: 1,
  titleKey: 'view.derivation.title',
  icon: 'tree',
  requires: ['derivation'],
  optional: ['state'],
  defaultSlot: 'side',
  order: 20,
  load: () => import('./DerivationView.tsx'),
});
