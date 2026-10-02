import { Fragment, useMemo } from 'react';
import { Group, Panel, Separator, type Layout, type LayoutChangedMeta } from 'react-resizable-panels';
import { useT } from '../i18n/I18nProvider.tsx';
import { loadPanelSizes, savePanelSizes, type PanelSizes } from './layoutStorage.ts';
import { defaultPanelSizes, MAX_PANELS, planPanels, type PanelPlan } from './planPanels.ts';
import { TabbedViews } from './TabbedViews.tsx';
import { isCompactWidth, useContainerWidth } from './useContainerWidth.ts';
import { ViewHost } from './ViewHost.tsx';
import type { ReactViewManifest, ViewProps } from './viewTypes.ts';

export interface WorkspaceProps extends ViewProps {
  /** Views available for this lab (already filtered by facets, e.g. via core `viewsFor`). */
  views: readonly ReactViewManifest[];
  /** Panel preset such as `"state|narration"` or `"state:60|narration:40"`; unknown ids are ignored. */
  layout?: string;
  maxPanels?: number;
}

const MIN_PANEL_SIZE = '15%';

interface PanelsProps extends ViewProps {
  plans: readonly PanelPlan[];
  byId: ReadonlyMap<string, ReactViewManifest>;
}

interface WorkspacePanelProps extends ViewProps {
  plan: PanelPlan;
  byId: ReadonlyMap<string, ReactViewManifest>;
}

function WorkspacePanel({ plan, byId, labId, lens }: WorkspacePanelProps) {
  const manifests = plan.viewIds.map((id) => byId.get(id)).filter((m): m is ReactViewManifest => m !== undefined);
  const [only] = manifests;
  if (manifests.length === 1 && only !== undefined) return <ViewHost manifest={only} labId={labId} lens={lens} />;
  return <TabbedViews manifests={manifests} labId={labId} lens={lens} />;
}

/** Narrow containers: panels one below the other in reading order, no resize handles. */
function StackedPanels({ plans, byId, labId, lens }: PanelsProps) {
  return (
    <div className="cv-workspace__stack">
      {plans.map((plan) => (
        <div key={plan.id} className="cv-workspace__panel cv-workspace__panel--stacked" data-panel-id={plan.id}>
          <WorkspacePanel plan={plan} byId={byId} labId={labId} lens={lens} />
        </div>
      ))}
    </div>
  );
}

/** Saved user sizes win over the preset's default sizes. */
export function initialPanelSizes(labId: string, plans: readonly PanelPlan[]): PanelSizes | undefined {
  return loadPanelSizes(labId, plans.map((plan) => plan.id)) ?? defaultPanelSizes(plans);
}

/** Wide containers: resizable side-by-side panels; user-resized sizes persist per lab. */
function ResizablePanels({ plans, byId, labId, lens }: PanelsProps) {
  const t = useT();
  const panelIds = useMemo(() => plans.map((plan) => plan.id), [plans]);
  const initialSizes = useMemo(() => initialPanelSizes(labId, plans), [labId, plans]);
  const persist = (layout: Layout, meta: LayoutChangedMeta) => {
    if (meta.isUserInteraction) savePanelSizes(labId, panelIds, meta.requestedLayout ?? layout);
  };
  return (
    <Group orientation="horizontal" defaultLayout={initialSizes} onLayoutChanged={persist}>
      {plans.map((plan, index) => (
        <Fragment key={plan.id}>
          {index > 0 && <Separator className="cv-separator" aria-label={t('ui.workspace.resize')} />}
          <Panel id={plan.id} minSize={MIN_PANEL_SIZE} className="cv-workspace__panel">
            <WorkspacePanel plan={plan} byId={byId} labId={labId} lens={lens} />
          </Panel>
        </Fragment>
      ))}
    </Group>
  );
}

/** Side-by-side resizable panels (tabs for overflow) that stack vertically in narrow containers. */
export function Workspace({ views, layout, maxPanels = MAX_PANELS, labId, lens }: WorkspaceProps) {
  const t = useT();
  const [containerRef, width] = useContainerWidth<HTMLDivElement>();
  const byId = useMemo(() => new Map(views.map((view) => [view.id, view])), [views]);
  const plans = useMemo(() => planPanels([...byId.keys()], layout, maxPanels), [byId, layout, maxPanels]);
  const compact = isCompactWidth(width);

  if (plans.length === 0) {
    return (
      <p className="cv-view__status" role="status">
        {t('ui.workspace.empty')}
      </p>
    );
  }

  const Panels = compact ? StackedPanels : ResizablePanels;
  return (
    <div ref={containerRef} className="cv-workspace" role="group" aria-label={t('ui.workspace.label')} data-layout={compact ? 'stacked' : 'columns'}>
      <Panels plans={plans} byId={byId} labId={labId} lens={lens} />
    </div>
  );
}
