import { defineView } from '@cryventure/core';
import type { ViewComponent } from '@cryventure/viz';

export default defineView<ViewComponent>({
  kind: 'view',
  id: 'lookup-table',
  apiVersion: 1,
  titleKey: 'view.lookup-table.title',
  icon: 'grid',
  requires: ['table'],
  defaultSlot: 'side',
  order: 100,
  load: () => import('./LookupTableView.tsx'),
});
