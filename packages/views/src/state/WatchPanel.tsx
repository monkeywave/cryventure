import type { CSSProperties } from 'react';
import type { NodeRef, RegionSpec } from '@cryventure/core';
import { INITIAL_STEP, formatHex, useLab, useLabActions, useT, type AnyStateFacet } from '@cryventure/viz';
import { watchHistory, watchLevel, type WatchEntry } from './watchHistory.ts';

interface WatchPanelProps {
  facet: AnyStateFacet;
  node: NodeRef;
}

const ELEM_MAX: Readonly<Record<RegionSpec<string>['elem'], number>> = { u8: 0xff, u16: 0xffff, u32: 0xffffffff, u64: Number.MAX_SAFE_INTEGER, i16: 0x7fff };

function WatchItem({ entry, current, elem }: { entry: WatchEntry; current: boolean; elem: RegionSpec<string>['elem'] }) {
  const t = useT();
  const step = entry.step === INITIAL_STEP ? t('view.state.watch.initial') : String(entry.step + 1);
  const style = { '--cv-watch-level': watchLevel(entry.value, ELEM_MAX[elem]) } as CSSProperties;
  return (
    <li className="cv-watch__entry" aria-current={current ? 'step' : undefined} data-step={entry.step}>
      <span className="cv-watch__bar" style={style} aria-hidden="true" />
      <span>{t('view.state.watch.entry', { step, value: formatHex(entry.value, elem) })}</span>
    </li>
  );
}

/** Debugger watch: the selected node's value history (last changes, with step numbers) up to the playhead. */
export function WatchPanel({ facet, node }: WatchPanelProps) {
  const t = useT();
  const step = useLab((state) => state.step);
  const { selectNode } = useLabActions();
  const region = facet.regions.find((entry) => entry.id === node.region);
  if (region === undefined) return null;
  const history = watchHistory(facet, node, step);
  const title = t('view.state.watch.title', { region: t(region.labelKey), index: node.index });
  return (
    <section className="cv-watch" aria-label={title}>
      <p className="cv-watch__header">
        <span>{title}</span>
        <button type="button" className="cv-button" onClick={() => selectNode(null)}>
          {t('view.state.watch.clear')}
        </button>
      </p>
      <ol className="cv-watch__list">
        {history.map((entry, position) => (
          <WatchItem key={entry.step} entry={entry} current={position === history.length - 1} elem={region.elem} />
        ))}
      </ol>
    </section>
  );
}

/** Shown in debugger mode until a cell is selected. */
export function WatchHint() {
  const t = useT();
  return <p className="cv-watch__hint">{t('view.state.watch.hint')}</p>;
}
