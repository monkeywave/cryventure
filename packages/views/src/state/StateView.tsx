import { stateAt, type RegionSpec, type StateFacet } from '@cryventure/core';
import { ByteGrid, useFacet, useLab, useT, type ViewProps } from '@cryventure/viz';
import { currentWords, type WordStep } from './currentWords.ts';
import { regionHighlights, regionLayout } from './regionLayout.ts';
import { wordHeaders } from './wordHeaders.ts';

type AnyStateFacet = StateFacet<string, { op: string }>;

interface RegionPanelProps {
  region: RegionSpec<string>;
  values: readonly number[];
  step: WordStep | undefined;
}

function RegionPanel({ region, values, step }: RegionPanelProps) {
  const t = useT();
  const label = t(region.labelKey);
  const layout = regionLayout(region);
  const isWords = layout.kind === 'words';
  const rowHeaders = isWords ? wordHeaders(layout.shape[0], currentWords(step, region.id), t) : undefined;
  return (
    <figure className={isWords ? 'cv-region cv-region--words' : 'cv-region'} data-region={region.id}>
      <figcaption className="cv-region__title">{label}</figcaption>
      <ByteGrid values={values} shape={layout.shape} order={layout.order} elem={region.elem} highlights={regionHighlights(step, region.id)} rowOffsets={layout.rowOffsets} rowHeaders={rowHeaders} layout={isWords ? 'wrap' : 'stack'} label={label} />
    </figure>
  );
}

function StateRegions({ facet }: { facet: AnyStateFacet }) {
  const step = useLab((state) => state.step);
  const snapshot = stateAt(facet, step);
  const current = facet.steps[step];
  return (
    <div className="cv-stack">
      {facet.regions.map((region) => (
        <RegionPanel key={region.id} region={region} values={snapshot[region.id] ?? []} step={current} />
      ))}
    </div>
  );
}

/** Every region of the state facet at the playhead, with the current step's highlights. */
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
