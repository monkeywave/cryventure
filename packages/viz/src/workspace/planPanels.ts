export const MAX_PANELS = 3;
const PRESET_SEPARATOR = '|';
const SIZE_SEPARATOR = ':';
const FULL_SIZE = 100;

export interface PanelPlan {
  /** Stable panel id (the first view's id), used for size persistence. */
  id: string;
  /** Views shown in this panel; more than one renders as tabs. */
  viewIds: string[];
  /** Default size in percent from the preset (`"state:60"`), if one was given. */
  defaultSize?: number;
}

/** One `id[:size]` entry of a layout preset. */
export interface LayoutEntry {
  id: string;
  size?: number;
}

function parseSize(text: string | undefined): number | undefined {
  if (text === undefined || text.trim() === '') return undefined;
  const size = Number(text);
  return Number.isFinite(size) && size > 0 && size <= FULL_SIZE ? size : undefined;
}

function parseEntry(raw: string): LayoutEntry {
  const [id = '', sizeText] = raw.split(SIZE_SEPARATOR);
  const size = parseSize(sizeText);
  return size === undefined ? { id: id.trim() } : { id: id.trim(), size };
}

/**
 * `"state:60|narration:40"` → `[{id:'state',size:60},{id:'narration',size:40}]`. Entries are
 * trimmed; empty and duplicate ids are dropped (first wins); invalid sizes are ignored.
 */
export function parseLayoutEntries(preset: string | undefined): LayoutEntry[] {
  if (preset === undefined) return [];
  const entries = preset.split(PRESET_SEPARATOR).map(parseEntry).filter((entry) => entry.id !== '');
  return entries.filter((entry, index) => entries.findIndex((other) => other.id === entry.id) === index);
}

/** `"state|narration"` → `['state', 'narration']` (trimmed, empty and duplicate entries dropped). */
export function parseLayoutPreset(preset: string | undefined): string[] {
  return parseLayoutEntries(preset).map((entry) => entry.id);
}

function toPlan(entry: LayoutEntry): PanelPlan {
  return entry.size === undefined ? { id: entry.id, viewIds: [entry.id] } : { id: entry.id, viewIds: [entry.id], defaultSize: entry.size };
}

/**
 * Distributes available views over at most `maxPanels` panels: preset views first (unknown ids
 * ignored), otherwise the first views in order; every remaining view becomes a tab of the last panel.
 */
export function planPanels(availableIds: readonly string[], preset?: string, maxPanels: number = MAX_PANELS): PanelPlan[] {
  const available = new Set(availableIds);
  const chosen = parseLayoutEntries(preset).filter((entry) => available.has(entry.id)).slice(0, maxPanels);
  const leads = chosen.length > 0 ? chosen : availableIds.slice(0, Math.min(maxPanels, 2)).map((id) => ({ id }));
  const panels = leads.map(toPlan);
  const leadIds = new Set(leads.map((entry) => entry.id));
  panels.at(-1)?.viewIds.push(...availableIds.filter((id) => !leadIds.has(id)));
  return panels;
}

/**
 * Preset default sizes as percentages summing to 100, or `undefined` unless every panel has one
 * (a partial preset cannot be distributed unambiguously, so the library's even split applies).
 */
export function defaultPanelSizes(plans: readonly PanelPlan[]): Record<string, number> | undefined {
  if (plans.length === 0 || plans.some((plan) => plan.defaultSize === undefined)) return undefined;
  const total = plans.reduce((sum, plan) => sum + (plan.defaultSize ?? 0), 0);
  return Object.fromEntries(plans.map((plan) => [plan.id, ((plan.defaultSize ?? 0) / total) * FULL_SIZE]));
}
