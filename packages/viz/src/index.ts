// i18n
export { I18nProvider, useT, type I18nProviderProps } from './i18n/I18nProvider.tsx';
// lab runtime
export * from './lab/labReducers.ts';
export { timelineLength } from './lab/timeline.ts';
export { createLabStore, type LabActions, type LabPlayhead, type LabState, type LabStore } from './lab/createLabStore.ts';
export { distinctOps, opAt, stateFacetOf, stateSteps, type AnyStateFacet, type AnyStateStep } from './lab/stateSteps.ts';
export { ROUND_LEVEL, nextScopeStart, prevScopeStart, scopeStarts } from './lab/scopeNavigation.ts';
export { browserScheduler, runTimed, type FrameScheduler } from './lab/frameScheduler.ts';
export { createPlaybackDriver, type PlaybackDriverOptions } from './lab/playbackDriver.ts';
export { LabProvider, useLab, useLabActions, useLabStore, type LabProviderProps } from './lab/LabContext.tsx';
export { LabRoot, type LabRootProps } from './lab/LabRoot.tsx';
export { LabLayoutProvider, useLabLayout, useOptionalLabLayout, type LabLayout, type LabLayoutProviderProps } from './lab/LabLayout.tsx';
export { lookupFacet, useFacet, type FacetResult } from './lab/useFacet.ts';
export { PLAYBACK_BASE_INTERVAL_MS, playbackIntervalMs, stepDurationMs, usePlayback, type UsePlaybackOptions } from './lab/usePlayback.ts';
// choreography
export { ChoreographyProvider, useActiveBeat, useChoreography, useFocusBeat, useChoreographyResolver, useStepProgress, type ChoreographyProviderProps } from './choreography/ChoreographyContext.tsx';
export { choreographStep, choreographyContext, createChoreographyResolver, type ChoreographyResolver } from './choreography/resolveChoreography.ts';
export { NODE_STYLE_VARS, VALUE_SWITCH, activeBeatIndex, focusIn, sampleNode, showsAfter, tracksForRegion } from './choreography/nodeTracks.ts';
export { keyToAction, useLabKeyboard, type LabKeyAction } from './lab/useLabKeyboard.ts';
// narration
export { currentNarrationRef, NARRATION_KEYS, type NarrationInput } from './narration/currentNarration.ts';
export { useCurrentNarration } from './narration/useCurrentNarration.ts';
// player
export { Caption } from './player/Caption.tsx';
export { Timeline } from './player/Timeline.tsx';
export { Controls } from './player/Controls.tsx';
export { ModeToggle } from './player/ModeToggle.tsx';
export { BreakpointPicker } from './player/BreakpointPicker.tsx';
export { compactOpLabel, opLabel, opLabelKey, opShortLabelKey } from './player/opLabel.ts';
export { markerPosition, timelineMarkers, type TimelineMarkers } from './player/timelineMarkers.ts';
export { DEFAULT_SCOPE_LEVEL_KEYS, formatScopePath, scopeAt, scopeLevelKeys, scopeParams } from './player/scopeLabel.ts';
export { useScopeLabel } from './player/useScopeLabel.ts';
// cells
export { ByteCell, type ByteCellProps } from './cells/ByteCell.tsx';
export { ByteGrid, cellMotion, type ByteGridProps, type GridLayoutMode, type GridMotion, type GridRowHeader } from './cells/ByteGrid.tsx';
export type { CellMotion } from './cells/useCellMotion.ts';
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
export { defaultPanelSizes, MAX_PANELS, parseLayoutEntries, parseLayoutPreset, planPanels, stackedOrder, type LayoutEntry, type PanelPlan } from './workspace/planPanels.ts';
export { COMPACT_BREAKPOINT_PX, isCompactWidth, useCompactContainer, useContainerWidth } from './workspace/useContainerWidth.ts';
export { LAYOUT_VERSION, layoutStorageKey, loadPanelSizes, savePanelSizes, type PanelSizes } from './workspace/layoutStorage.ts';
