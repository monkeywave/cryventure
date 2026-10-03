import { defineView } from '@cryventure/core';
import type { ViewComponent } from '@cryventure/viz';

export default defineView<ViewComponent>({
  kind: 'view',
  id: 'field',
  apiVersion: 1,
  titleKey: 'view.field.title',
  icon: 'grid',
  requires: ['field'],
  lenses: ['story', 'engineer', 'cryptographer'],
  defaultSlot: 'side',
  order: 105,
  load: () => import('./FieldView.tsx'),
});
