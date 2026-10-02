// i18n
export { I18nProvider, useT, type I18nProviderProps } from './i18n/I18nProvider.tsx';
// lab runtime
export * from './lab/labReducers.ts';
export { timelineLength } from './lab/timeline.ts';
export { createLabStore, type LabActions, type LabState, type LabStore } from './lab/createLabStore.ts';
export { LabProvider, useLab, useLabActions, useLabStore, type LabProviderProps } from './lab/LabContext.tsx';
export { LabRoot, type LabRootProps } from './lab/LabRoot.tsx';
export { lookupFacet, useFacet, type FacetResult } from './lab/useFacet.ts';
export { PLAYBACK_BASE_INTERVAL_MS, playbackIntervalMs, usePlayback } from './lab/usePlayback.ts';
export { keyToAction, useLabKeyboard, type LabKeyAction } from './lab/useLabKeyboard.ts';
// player
export { Timeline } from './player/Timeline.tsx';
export { Controls } from './player/Controls.tsx';
export { DEFAULT_SCOPE_LEVEL_KEYS, formatScopePath, scopeAt } from './player/scopeLabel.ts';
export { useScopeLabel } from './player/useScopeLabel.ts';
// cells
export { ByteCell, type ByteCellProps } from './cells/ByteCell.tsx';
export { ByteGrid, type ByteGridProps, type GridLayoutMode, type GridRowHeader } from './cells/ByteGrid.tsx';
export { StateMatrix, type StateMatrixProps } from './cells/StateMatrix.tsx';
export { cellIndex, highlightMap, moveGridFocus, type GridHighlight, type GridOrder, type GridPosition, type GridShape } from './cells/gridLayout.ts';
export { HIGHLIGHT_GLYPHS } from './cells/glyphs.ts';
export { formatHex, formatOffset, toHex } from './cells/hex.ts';
// workspace
export type { ReactViewManifest, ViewComponent, ViewProps } from './workspace/viewTypes.ts';
export { initialPanelSizes, Workspace, type WorkspaceProps } from './workspace/Workspace.tsx';
export { ViewHost, type ViewHostProps } from './workspace/ViewHost.tsx';
export { TabbedViews, type TabbedViewsProps } from './workspace/TabbedViews.tsx';
export { ErrorBoundary, type ErrorBoundaryProps } from './workspace/ErrorBoundary.tsx';
export { defaultPanelSizes, MAX_PANELS, parseLayoutEntries, parseLayoutPreset, planPanels, type LayoutEntry, type PanelPlan } from './workspace/planPanels.ts';
export { COMPACT_BREAKPOINT_PX, isCompactWidth, useContainerWidth } from './workspace/useContainerWidth.ts';
export { LAYOUT_VERSION, layoutStorageKey, loadPanelSizes, savePanelSizes, type PanelSizes } from './workspace/layoutStorage.ts';
