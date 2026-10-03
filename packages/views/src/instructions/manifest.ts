import { defineView } from '@cryventure/core';
import type { ViewComponent } from '@cryventure/viz';

export default defineView<ViewComponent>({
  kind: 'view',
  id: 'instructions',
  apiVersion: 1,
  titleKey: 'view.instructions.title',
  icon: 'code',
  requires: ['instructions'],
  optional: ['registers', 'values'],
  defaultSlot: 'side',
  order: 30,
  load: () => import('./InstructionsView.tsx'),
});
