import { Fragment, useMemo } from 'react';
import { Group, Panel, Separator, type Layout, type LayoutChangedMeta } from 'react-resizable-panels';
import { useT } from '../i18n/I18nProvider.tsx';
import { loadPanelSizes, savePanelSizes, type PanelSizes } from './layoutStorage.ts';
import { useLabLayout } from '../lab/LabLayout.tsx';
import { defaultPanelSizes, MAX_PANELS, planPanels, stackedOrder, type PanelPlan } from './planPanels.ts';
import { TabbedViews } from './TabbedViews.tsx';
import { ViewHost } from './ViewHost.tsx';
import { ViewStatus } from './ViewStatus.tsx';
import type { ReactViewManifest, ViewProps } from './viewTypes.ts';

export interface WorkspaceProps extends ViewProps {
  /** Views available for this lab (already filtered by facets, e.g. via core `viewsFor`). */
  views: readonly ReactViewManifest[];
  /** Panel preset such as `"state|narration"` or `"state:60|narration:40"`; unknown ids are ignored. */
  layout?: string;
  maxPanels?: number;
}

/**
 * Ids of the views the lab caption replaces on narrow screens (`narrowPlacement: 'caption'`); the
 * stacked workspace leaves them out. Wide layouts always show every view.
 */
function captionViewIds(views: readonly ReactViewManifest[]): string[] {
  return views.filter((view) => view.narrowPlacement === 'caption').map((view) => view.id);
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

/** Panel plans for the current layout: stacked plans skip `hidden` views and put main-slot views first. */
function usePanelPlans(byId: ReadonlyMap<string, ReactViewManifest>, layout: string | undefined, maxPanels: number, compact: boolean, hidden: readonly string[]) {
  return useMemo(() => {
    if (!compact) return planPanels([...byId.keys()], layout, maxPanels);
    const shown = [...byId.keys()].filter((id) => !hidden.includes(id));
    return stackedOrder(planPanels(shown, layout, maxPanels), (id) => byId.get(id)?.defaultSlot === 'main');
  }, [byId, layout, maxPanels, compact, hidden]);
}

/**
 * Side-by-side resizable panels (tabs for overflow) that stack vertically on narrow labs. The lab
 * container measures the width once (`useLabLayout`); outside a lab the workspace is wide.
 */
export function Workspace({ views, layout, maxPanels = MAX_PANELS, labId, lens }: WorkspaceProps) {
  const t = useT();
  const { narrow: compact } = useLabLayout();
  const byId = useMemo(() => new Map(views.map((view) => [view.id, view])), [views]);
  const hidden = useMemo(() => captionViewIds(views), [views]);
  const plans = usePanelPlans(byId, layout, maxPanels, compact, hidden);

  if (plans.length === 0) return <ViewStatus status="empty" />;

  const Panels = compact ? StackedPanels : ResizablePanels;
  return (
    <div className="cv-workspace" role="group" aria-label={t('ui.workspace.label')} data-layout={compact ? 'stacked' : 'columns'}>
      <Panels plans={plans} byId={byId} labId={labId} lens={lens} />
    </div>
  );
}
