import { memo, useCallback, useMemo } from 'react';
import { stateAt, type AnyStateFacet, type Beat, type NodeRef, type RegionSpec, type StateStep, type StepChoreography } from '@cryventure/core';
import {
  ByteGrid,
  INITIAL_STEP,
  ViewStatus,
  focusIn,
  tracksForRegion,
  useChoreography,
  useFacet,
  useFocusBeat,
  useLab,
  useLabActions,
  useStepProgress,
  useT,
  type GridMotion,
  type ViewProps,
} from '@cryventure/viz';
import { currentWords } from './currentWords.ts';
import { RegionDisclosure } from './RegionDisclosure.tsx';
import { isCollapsibleRegion, regionHighlights, regionLayout } from './regionLayout.ts';
import { WatchHint, WatchPanel } from './WatchPanel.tsx';
import { wordHeaders } from './wordHeaders.ts';
import './state.css';

const STATUS_KEYS = { loading: 'view.state.loading', missing: 'view.state.missing' } as const;

interface RegionPanelProps {
  region: RegionSpec<string>;
  values: readonly number[];
  step: StateStep<string, { op: string }> | undefined;
  motion: GridMotion | undefined;
  beat: Beat | undefined;
  /** Flat index of the watched node when it lies in this region. */
  selectedIndex: number | undefined;
  onSelect: (node: NodeRef) => void;
  /** Hide the caption visually (it stays for screen readers) when a disclosure button already names the region. */
  captionHidden?: boolean;
}

/** One region as a grid, laid out by the producer's hint; re-renders only when its own inputs change. */
const RegionPanel = memo(function RegionPanel({ region, values, step, motion, beat, selectedIndex, onSelect, captionHidden }: RegionPanelProps) {
  const t = useT();
  const label = t(region.labelKey);
  const layout = useMemo(() => regionLayout(region), [region]);
  const highlights = useMemo(() => regionHighlights(step, region.id), [step, region.id]);
  const { words } = layout;
  const rowHeaders = useMemo(
    () => (words === undefined ? undefined : wordHeaders(layout.shape[0], currentWords(highlights, words.elemsPerWord), t, words.labelPrefix)),
    [words, layout.shape, highlights, t],
  );
  const focus = useMemo(() => focusIn(beat, region.id), [beat, region.id]);
  const onSelectCell = useCallback((index: number) => onSelect({ region: region.id, index }), [onSelect, region.id]);
  return (
    <figure className={words === undefined ? 'cv-region' : 'cv-region cv-region--words'} data-region={region.id}>
      <figcaption className={captionHidden ? 'cv-region__title cv-visually-hidden' : 'cv-region__title'}>{label}</figcaption>
      <ByteGrid
        values={values}
        shape={layout.shape}
        order={layout.order}
        elem={region.elem}
        highlights={highlights}
        rowOffsets={layout.rowOffsets}
        rowHeaders={rowHeaders}
        layout={words === undefined ? 'stack' : 'wrap'}
        wrapColumns={words?.wordsPerLine}
        label={label}
        motion={motion}
        focus={focus}
        selectedIndex={selectedIndex}
        onSelectCell={onSelectCell}
      />
    </figure>
  );
});

/** Large regions (e.g. a key schedule) sit behind a disclosure; small ones render directly. */
function CollapsibleRegionPanel(props: RegionPanelProps) {
  if (!isCollapsibleRegion(props.region)) return <RegionPanel {...props} />;
  return (
    <RegionDisclosure region={props.region}>
      <RegionPanel {...props} captionHidden />
    </RegionDisclosure>
  );
}

/** Per-region choreography input: the values before the step and its tracks (none at the initial state). */
function useRegionMotions(facet: AnyStateFacet, step: number, choreography: StepChoreography | undefined): ReadonlyMap<string, GridMotion> {
  const progress = useStepProgress();
  return useMemo(() => {
    const motions = new Map<string, GridMotion>();
    if (step === INITIAL_STEP || choreography === undefined) return motions;
    const before = stateAt(facet, step - 1);
    for (const region of facet.regions) motions.set(region.id, { progress, before: before[region.id] ?? [], tracks: tracksForRegion(choreography, region.id) });
    return motions;
  }, [facet, step, choreography, progress]);
}

function WatchArea({ facet }: { facet: AnyStateFacet }) {
  const debugging = useLab((state) => state.mode === 'debugger');
  const node = useLab((state) => state.selection.node);
  if (!debugging) return null;
  return node === null ? <WatchHint /> : <WatchPanel facet={facet} node={node} />;
}

function StateRegions({ facet }: { facet: AnyStateFacet }) {
  const step = useLab((state) => state.step);
  const selected = useLab((state) => state.selection.node);
  const { selectNode } = useLabActions();
  const choreography = useChoreography();
  const beat = useFocusBeat(choreography);
  const motions = useRegionMotions(facet, step, choreography);
  const snapshot = stateAt(facet, step);
  const current = facet.steps[step];
  return (
    <div className="cv-stack">
      {facet.regions.map((region) => (
        <CollapsibleRegionPanel
          key={region.id}
          region={region}
          values={snapshot[region.id] ?? []}
          step={current}
          motion={motions.get(region.id)}
          beat={beat}
          selectedIndex={selected?.region === region.id ? selected.index : undefined}
          onSelect={selectNode}
        />
      ))}
      <WatchArea facet={facet} />
    </div>
  );
}

/**
 * Every region of the state facet at the playhead, animated by the step's choreography (moves,
 * pulses, value switch, beat focus), with the step's highlights and a debugger watch of one cell.
 * Regions follow the producer's layout hint; those with more than 64 elements are collapsible
 * (collapsed by default on narrow labs).
 */
export default function StateView(_props: ViewProps) {
  const facet = useFacet<AnyStateFacet>('state');
  if (facet.status !== 'ready') return <ViewStatus status={facet.status} keys={STATUS_KEYS} />;
  return <StateRegions facet={facet.data} />;
}
