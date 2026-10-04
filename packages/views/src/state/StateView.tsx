import { memo, useCallback, useMemo, useState } from 'react';
import { stateAt, unwrittenAt, type AnyStateFacet, type Beat, type Lens, type NodeRef, type RegionSpec, type StateStep, type StepChoreography } from '@cryventure/core';
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
import { isCollapsibleRegion, regionDensity, regionHighlights, regionLayout } from './regionLayout.ts';
import { WatchHint, WatchPanel } from './WatchPanel.tsx';
import { displayIndex, gridInputsToDisplay, hasLittleEndianWords, reversesWords, type WordDisplay } from './wordByteOrder.ts';
import { wordHeaders } from './wordHeaders.ts';
import { WordOrderControl } from './WordOrderControl.tsx';
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
  /** Flat indices not yet written at the playhead (regions declared `initial: 'blank'`). */
  unwritten: ReadonlySet<number> | undefined;
  /** Hide the caption visually (it stays for screen readers) when a disclosure button already names the region. */
  captionHidden?: boolean;
  /** How little-endian words are drawn (integer value or memory order); other regions ignore it. */
  wordDisplay: WordDisplay;
}

/**
 * Expanded, a large (collapsible) region, e.g. 64 or 80 schedule words in a narrow column, scrolls
 * inside this height instead of stretching the whole lab. A short one (the AES-128 key schedule) fits.
 */
const LARGE_REGION_MAX_BLOCK = '20rem';

/** One region as a grid, laid out by the producer's hint; re-renders only when its own inputs change. */
const RegionPanel = memo(function RegionPanel({ region, values, step, motion, beat, selectedIndex, onSelect, unwritten, captionHidden, wordDisplay }: RegionPanelProps) {
  const t = useT();
  const label = t(region.labelKey);
  const layout = useMemo(() => regionLayout(region), [region]);
  const highlights = useMemo(() => regionHighlights(step, region.id), [step, region.id]);
  const { words } = layout;
  const rowHeaders = useMemo(
    () => (words === undefined ? undefined : wordHeaders(layout.shape[0], currentWords(highlights, words.elemsPerWord), t, words.labelPrefix)),
    [words, layout.shape, highlights, t],
  );
  const columnHeaders = useMemo(() => layout.columnLabels?.map((text) => ({ text, label: t('ui.grid.offset', { offset: text }) })), [layout.columnLabels, t]);
  const focus = useMemo(() => focusIn(beat, region.id), [beat, region.id]);
  // Reversed little-endian words: the grid sees displayed positions; selection maps back to the memory byte.
  const reversedWordSize = reversesWords(words, wordDisplay) ? words?.elemsPerWord : undefined;
  const shown = useMemo(
    () => gridInputsToDisplay({ values, highlights, motion, focus, unwritten, selectedIndex }, reversedWordSize),
    [values, highlights, motion, focus, unwritten, selectedIndex, reversedWordSize],
  );
  const onSelectCell = useCallback(
    (index: number) => onSelect({ region: region.id, index: reversedWordSize === undefined ? index : displayIndex(index, reversedWordSize) }),
    [onSelect, region.id, reversedWordSize],
  );
  return (
    <figure
      className={words === undefined ? 'cv-region' : 'cv-region cv-region--words'}
      data-region={region.id}
      data-density={regionDensity(layout)}
      data-byte-order={words?.byteOrder}
      data-word-display={words?.byteOrder === 'little' ? wordDisplay : undefined}
    >
      <figcaption className={captionHidden ? 'cv-region__title cv-visually-hidden' : 'cv-region__title'}>{label}</figcaption>
      <ByteGrid
        values={shown.values}
        shape={layout.shape}
        order={layout.order}
        elem={region.elem}
        highlights={shown.highlights}
        rowOffsets={layout.rowOffsets}
        rowHeaders={rowHeaders}
        columnHeaders={columnHeaders}
        layout={words === undefined ? 'stack' : 'wrap'}
        wrapColumns={words?.wordsPerLine}
        label={label}
        motion={shown.motion}
        focus={shown.focus}
        selectedIndex={shown.selectedIndex}
        onSelectCell={onSelectCell}
        unwritten={shown.unwritten}
        maxBlockSize={isCollapsibleRegion(region) ? LARGE_REGION_MAX_BLOCK : undefined}
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

/** Values and placeholders just before `step` (memoised per facet and step, not per playback frame). */
function useStateBefore(facet: AnyStateFacet, step: number) {
  return useMemo(() => (step === INITIAL_STEP ? undefined : { values: stateAt(facet, step - 1), unwritten: unwrittenAt(facet, step - 1) }), [facet, step]);
}

/** Per-region choreography input: the values before the step and its tracks (none at the initial state). */
function useRegionMotions(
  facet: AnyStateFacet,
  step: number,
  choreography: StepChoreography | undefined,
  unwrittenAfter: ReadonlyMap<string, ReadonlySet<number>>,
): ReadonlyMap<string, GridMotion> {
  const progress = useStepProgress();
  const before = useStateBefore(facet, step);
  return useMemo(() => {
    const motions = new Map<string, GridMotion>();
    if (before === undefined || choreography === undefined) return motions;
    for (const { id } of facet.regions) {
      motions.set(id, {
        progress,
        before: before.values[id] ?? [],
        unwrittenBefore: before.unwritten.get(id),
        unwrittenAfter: unwrittenAfter.get(id),
        tracks: tracksForRegion(choreography, id),
      });
    }
    return motions;
  }, [facet, before, choreography, progress, unwrittenAfter]);
}

function WatchArea({ facet }: { facet: AnyStateFacet }) {
  const debugging = useLab((state) => state.mode === 'debugger');
  const node = useLab((state) => state.selection.node);
  if (!debugging) return null;
  return node === null ? <WatchHint /> : <WatchPanel facet={facet} node={node} />;
}

/** The note on little-endian words and, in the engineer lens, the memory-order toggle (nothing without such words). */
function useWordDisplay(facet: AnyStateFacet, lens: Lens) {
  const [display, setDisplay] = useState<WordDisplay>('integer');
  const hasLittle = useMemo(() => hasLittleEndianWords(facet.regions), [facet.regions]);
  const engineer = lens === 'engineer';
  const wordDisplay: WordDisplay = engineer ? display : 'integer';
  const control = hasLittle ? <WordOrderControl display={wordDisplay} toggleable={engineer} onChange={setDisplay} /> : null;
  return { wordDisplay, control };
}

function StateRegions({ facet, lens }: { facet: AnyStateFacet; lens: Lens }) {
  const step = useLab((state) => state.step);
  const selected = useLab((state) => state.selection.node);
  const { selectNode } = useLabActions();
  const choreography = useChoreography();
  const beat = useFocusBeat(choreography);
  const unwritten = useMemo(() => unwrittenAt(facet, step), [facet, step]);
  const motions = useRegionMotions(facet, step, choreography, unwritten);
  const snapshot = stateAt(facet, step);
  const current = facet.steps[step];
  const { wordDisplay, control } = useWordDisplay(facet, lens);
  return (
    <div className="cv-stack">
      {control}
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
          unwritten={unwritten.get(region.id)}
          wordDisplay={wordDisplay}
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
 * (collapsed by default on narrow labs). Little-endian words show their integer value (bytes
 * reversed); the engineer lens can switch them to memory order.
 */
export default function StateView({ lens }: ViewProps) {
  const facet = useFacet<AnyStateFacet>('state');
  if (facet.status !== 'ready') return <ViewStatus status={facet.status} keys={STATUS_KEYS} />;
  return <StateRegions facet={facet.data} lens={lens} />;
}
