import { defineView } from '@cryventure/core';
import type { ReactViewManifest, ViewComponent, ViewProps } from './viewTypes.ts';

/** Test-only manifests: `fakeView('a')` renders "view a (lab/lens)". */
export function fakeView(id: string, load?: ReactViewManifest['load']): ReactViewManifest {
  const Component: ViewComponent = ({ labId, lens }: ViewProps) => <p>{`view ${id} (${labId}/${lens})`}</p>;
  return defineView<ViewComponent>({
    kind: 'view',
    id,
    apiVersion: 1,
    titleKey: `view.${id}.title`,
    icon: 'grid',
    requires: [],
    load: load ?? (() => Promise.resolve({ default: Component })),
  });
}
