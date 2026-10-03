import { parseLayoutPreset } from '@cryventure/viz';

/**
 * Which views a lab island offers (`LabProps.views`): `"all"` (default) = every view the bundle can
 * feed, as tabs; `"layout-only"` = only the views its `layout` names (the home hero: state + narration).
 */
export type LabViewsOption = 'all' | 'layout-only';

/** The views to show; `"layout-only"` falls back to every view when the layout names none of them. */
export function viewsToShow<View extends { id: string }>(views: View[], layout: string | undefined, option: LabViewsOption | undefined): View[] {
  if (option !== 'layout-only') return views;
  const named = new Set(parseLayoutPreset(layout));
  const shown = views.filter((view) => named.has(view.id));
  return shown.length > 0 ? shown : views;
}
