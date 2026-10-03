import { parseLayoutPreset } from '@cryventure/viz';

/**
 * Which views a lab offers (`<Lab views>`): `"all"` (default) = every view the bundle can feed,
 * as tabs; `"layout-only"` = only the views its `layout` names (e.g. the home hero: state + narration).
 */
export const LAB_VIEWS_OPTIONS = ['all', 'layout-only'] as const;
export type LabViewsOption = (typeof LAB_VIEWS_OPTIONS)[number];

export function isLabViewsOption(value: unknown): value is LabViewsOption {
  return LAB_VIEWS_OPTIONS.includes(value as LabViewsOption);
}

/** The views to show; `"layout-only"` falls back to every view when the layout names none of them. */
export function viewsToShow<View extends { id: string }>(views: View[], layout: string | undefined, option: LabViewsOption | undefined): View[] {
  if (option !== 'layout-only') return views;
  const named = new Set(parseLayoutPreset(layout));
  const shown = views.filter((view) => named.has(view.id));
  return shown.length > 0 ? shown : views;
}
