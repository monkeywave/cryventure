import { useMemo } from 'react';
import { stateAt, type NodeRef, type RegionSpec, type StateFacet, type StepChoreography } from '@cryventure/core';
import {
  ByteGrid,
  INITIAL_STEP,
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
import { currentWords, type WordStep } from './currentWords.ts';
import { RegionDisclosure } from './RegionDisclosure.tsx';
import { isCollapsibleRegion, regionHighlights, regionLayout } from './regionLayout.ts';
import { WatchHint, WatchPanel } from './WatchPanel.tsx';
import { wordHeaders } from './wordHeaders.ts';

type AnyStateFacet = StateFacet<string, { op: string }>;

interface RegionPanelProps {
  region: RegionSpec<string>;
  values: readonly number[];
  step: WordStep | undefined;
  motion: GridMotion | undefined;
  focus: ReadonlySet<number> | undefined;
  selected: NodeRef | null;
  onSelect: (node: NodeRef) => void;
}

function RegionPanel({ region, values, step, motion, focus, selected, onSelect }: RegionPanelProps) {
  const t = useT();
  const label = t(region.labelKey);
  const layout = regionLayout(region);
  const isWords = layout.kind === 'words';
  const rowHeaders = isWords ? wordHeaders(layout.shape[0], currentWords(step, region.id), t) : undefined;
  return (
    <figure className={isWords ? 'cv-region cv-region--words' : 'cv-region'} data-region={region.id}>
      <figcaption className="cv-region__title">{label}</figcaption>
      <ByteGrid
        values={values}
        shape={layout.shape}
        order={layout.order}
        elem={region.elem}
        highlights={regionHighlights(step, region.id)}
        rowOffsets={layout.rowOffsets}
        rowHeaders={rowHeaders}
        layout={isWords ? 'wrap' : 'stack'}
        label={label}
        motion={motion}
        focus={focus}
        selectedIndex={selected?.region === region.id ? selected.index : undefined}
        onSelectCell={(index) => onSelect({ region: region.id, index })}
      />
    </figure>
  );
}

/** Large regions (e.g. a key schedule) sit behind a disclosure; small ones render directly. */
function CollapsibleRegionPanel(props: RegionPanelProps) {
  if (!isCollapsibleRegion(props.region)) return <RegionPanel {...props} />;
  return (
    <RegionDisclosure region={props.region}>
      <RegionPanel {...props} />
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
          focus={focusIn(beat, region.id)}
          selected={selected}
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
 * Regions with more than 64 elements are collapsible (collapsed by default on narrow labs).
 */
export default function StateView(_props: ViewProps) {
  const t = useT();
  const facet = useFacet<AnyStateFacet>('state');
  if (facet.status !== 'ready') {
    return (
      <p className="cv-view__status" role="status">
        {t(facet.status === 'loading' ? 'view.state.loading' : 'view.state.missing')}
      </p>
    );
  }
  return <StateRegions facet={facet.data} />;
}
