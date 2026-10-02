import { defineView } from '@cryventure/core';
import type { ViewComponent } from '@cryventure/viz';

export default defineView<ViewComponent>({
  kind: 'view',
  id: 'key-schedule',
  apiVersion: 1,
  titleKey: 'view.key-schedule.title',
  icon: 'tree',
  requires: ['derivation'],
  optional: ['state'],
  defaultSlot: 'side',
  order: 20,
  load: () => import('./KeyScheduleView.tsx'),
});
