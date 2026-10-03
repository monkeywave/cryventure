// Public API of @cryventure/viz: what apps/web and @cryventure/views import, plus the documented
// hooks and types for view authors (docs/EXTENDING.md). Internals stay module-private.

// i18n
export { I18nProvider, useT, type I18nProviderProps } from './i18n/I18nProvider.tsx';
// lab runtime
export { INITIAL_STEP, LAB_MODES, selectStepCount, type LabMode } from './lab/labReducers.ts';
export { createLabStore, type BlockLabHrefBuilder, type LabActions, type LabHrefBuilder, type LabState, type LabStoreOptions, type LabStore, type ParamsPatch, type ParamsRequestHandler, type SetBundleOptions } from './lab/createLabStore.ts';
export { stateSteps, type AnyStateFacet, type AnyStateStep } from './lab/stateSteps.ts';
export { useDerivers, useLab, useLabActions, useLabStore } from './lab/LabContext.tsx';
export { LabRoot, type LabRootProps } from './lab/LabRoot.tsx';
export { LabLayoutProvider, useLabLayout, type LabLayout, type LabLayoutProviderProps } from './lab/LabLayout.tsx';
export { facetData, useFacet, useFacetVariants, useVariantFacets, type FacetResult } from './lab/useFacet.ts';
export { useVariantChoice, type FacetVariantChoice } from './lab/useVariantChoice.ts';
export { deriveOnce, derivationCandidates, hasDeriverInputs, isDeriverApplicable, type DerivedFacets } from './lab/derive.ts';
// choreography
export { useActiveBeat, useChoreography, useFocusBeat, useStepProgress } from './choreography/ChoreographyContext.tsx';
export { focusIn, tracksForRegion } from './choreography/nodeTracks.ts';
// narration
export { useCurrentNarration } from './narration/useCurrentNarration.ts';
// text
export { MathText } from './text/MathText.tsx';
export { mathTextSegments, toSuperscript, type MathTextSegment } from './text/mathText.ts';
// player
export { Caption } from './player/Caption.tsx';
export { Timeline } from './player/Timeline.tsx';
export { Controls } from './player/Controls.tsx';
export { ModeToggle } from './player/ModeToggle.tsx';
export { BreakpointPicker } from './player/BreakpointPicker.tsx';
export type { OpLabelMap } from './player/opLabel.ts';
export { useScopeLabel } from './player/useScopeLabel.ts';
// cells
export { ByteGrid, type ByteGridProps, type GridLayoutMode, type GridMotion, type GridRowHeader } from './cells/ByteGrid.tsx';
export { cellIndex, type GridHighlight, type GridOrder, type GridShape } from './cells/gridLayout.ts';
export { formatHex, toHex } from './cells/hex.ts';
export { useGridNavigation } from './cells/useGridNavigation.ts';
// workspace
export type { ReactViewManifest, ViewComponent, ViewProps } from './workspace/viewTypes.ts';
export { Workspace, type WorkspaceProps } from './workspace/Workspace.tsx';
export { parseLayoutPreset } from './workspace/planPanels.ts';
export { ViewStatus, type ViewStatusKind, type ViewStatusProps } from './workspace/ViewStatus.tsx';
export { ErrorBoundary, type ErrorBoundaryProps } from './workspace/ErrorBoundary.tsx';
export { safeStorage } from './workspace/safeStorage.ts';
export { useWidthObserver } from './workspace/useContainerWidth.ts';
