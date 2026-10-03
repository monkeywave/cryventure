import { defineView } from '@cryventure/core';
import type { ViewComponent } from '@cryventure/viz';

export default defineView<ViewComponent>({
  kind: 'view',
  id: 'memory',
  apiVersion: 1,
  titleKey: 'view.memory.title',
  icon: 'bytes',
  requires: ['memory'],
  optional: ['values'],
  defaultSlot: 'side',
  order: 34,
  load: () => import('./MemoryView.tsx'),
});
