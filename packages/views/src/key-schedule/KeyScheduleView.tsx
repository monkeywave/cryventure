import { useId, useMemo, useState, type ComponentProps } from 'react';
import type { DerivationFacet, DerivationNode } from '@cryventure/core';
import { useFacet, useLab, useT, type ViewProps } from '@cryventure/viz';
import { currentGroup, derivationChain, roundKeyRows, rowStatus, wordHex, type ChainLink, type RoundKeyRow, type RowStatus } from './keyScheduleModel.ts';

/**
 * Key schedule: round keys as rows of words (wrapping at narrow widths), the most recently used
 * round key marked, and the derivation chain of the selected/hovered/focused word.
 * Styled by the `cv-keyschedule` block of `@cryventure/viz/viz.css` (class names only, no inline styles).
 */
const XOR_GLYPH = '⊕';
const ARROW_GLYPH = '→';
const CURRENT_GLYPH = '▸';

const ROW_LABEL_KEY: Record<RowStatus, string> = {
  current: 'view.key-schedule.roundKeyCurrent',
  used: 'view.key-schedule.roundKey',
  upcoming: 'view.key-schedule.roundKeyUpcoming',
};

interface WordHandlers {
  selectedId: string | null;
  toggle: (id: string) => void;
  preview: (id: string | null) => void;
}

function WordButton({ word, handlers }: { word: DerivationNode; handlers: WordHandlers }) {
  const t = useT();
  const name = t(word.label);
  const hex = wordHex(word.bytes);
  const selected = handlers.selectedId === word.id;
  return (
    <button
      type="button"
      className="cv-keyschedule__word"
      aria-pressed={selected}
      aria-label={t('view.key-schedule.word', { name, hex })}
      title={name}
      data-node={word.id}
      onClick={() => handlers.toggle(word.id)}
      onMouseEnter={() => handlers.preview(word.id)}
      onMouseLeave={() => handlers.preview(null)}
      onFocus={() => handlers.preview(word.id)}
      onBlur={() => handlers.preview(null)}
    >
      {hex}
    </button>
  );
}

function RoundKeyItem({ row, status, handlers }: { row: RoundKeyRow; status: RowStatus; handlers: WordHandlers }) {
  const t = useT();
  const labelId = useId();
  const current = status === 'current';
  return (
    <li className="cv-keyschedule__row" data-status={status} aria-current={current ? 'step' : undefined}>
      <span id={labelId} className="cv-keyschedule__label">
        {current && <span aria-hidden="true">{CURRENT_GLYPH} </span>}
        {t(ROW_LABEL_KEY[status], { round: row.group })}
      </span>
      <ul className="cv-keyschedule__words" aria-labelledby={labelId}>
        {row.words.map((word) => (
          <li key={word.id}>
            <WordButton word={word} handlers={handlers} />
          </li>
        ))}
      </ul>
    </li>
  );
}

/** One line of the chain: a glyph column, the value's name and its hex (FIPS 197 Appendix A layout). */
function ChainRow({ glyph, node, ...rest }: { glyph: string; node: DerivationNode } & Omit<ComponentProps<'li'>, 'children'>) {
  const t = useT();
  return (
    <li className="cv-keyschedule__link" {...rest}>
      <span className="cv-keyschedule__glyph" aria-hidden="true">
        {glyph}
      </span>
      <span className="cv-keyschedule__name">{t(node.label)}</span> <code className="cv-keyschedule__hex">{wordHex(node.bytes)}</code>
    </li>
  );
}

function OperandRow({ node }: { node: DerivationNode }) {
  const t = useT();
  const label = t('view.key-schedule.xorWith', { name: t(node.label), hex: wordHex(node.bytes) });
  return <ChainRow glyph={XOR_GLYPH} node={node} aria-label={label} data-operand="" />;
}

/** XOR operands on their own lines, then the value they produce (`→`); the first link has no glyph. */
function LinkRows({ link, first }: { link: ChainLink; first: boolean }) {
  return (
    <>
      {link.operands.map((operand) => (
        <OperandRow key={operand.id} node={operand} />
      ))}
      <ChainRow glyph={first ? '' : ARROW_GLYPH} node={link.node} data-op={link.node.op} />
    </>
  );
}

function ChainList({ links }: { links: ChainLink[] }) {
  const t = useT();
  const target = links.at(-1)?.node;
  if (target === undefined) return <p>{t('view.key-schedule.hint')}</p>;
  const name = t(target.label);
  if (links.length === 1) return <p>{t('view.key-schedule.fromKey', { name })}</p>;
  return (
    <>
      <p>{t('view.key-schedule.chainTitle', { name })}</p>
      <ol className="cv-keyschedule__links">
        {links.map((link, index) => (
          <LinkRows key={link.node.id} link={link} first={index === 0} />
        ))}
      </ol>
    </>
  );
}

function useWordHandlers(): WordHandlers & { shownId: string | null } {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [previewId, setPreviewId] = useState<string | null>(null);
  return {
    selectedId,
    shownId: previewId ?? selectedId,
    toggle: (id) => setSelectedId((current) => (current === id ? null : id)),
    preview: setPreviewId,
  };
}

function KeySchedule({ facet }: { facet: DerivationFacet }) {
  const t = useT();
  const step = useLab((state) => state.step);
  const rows = useMemo(() => roundKeyRows(facet), [facet]);
  const handlers = useWordHandlers();
  const current = currentGroup(rows, step);
  const links = useMemo(() => (handlers.shownId === null ? [] : derivationChain(facet, handlers.shownId)), [facet, handlers.shownId]);
  return (
    <section className="cv-keyschedule" aria-label={t('view.key-schedule.title')}>
      <ol className="cv-keyschedule__rows">
        {rows.map((row) => (
          <RoundKeyItem key={row.group} row={row} status={rowStatus(row, step, current)} handlers={handlers} />
        ))}
      </ol>
      <div className="cv-keyschedule__chain" aria-live="polite">
        <ChainList links={links} />
      </div>
    </section>
  );
}

/** Words of the `derivation` facet grouped into round keys, with the derivation of one word. */
export default function KeyScheduleView(_props: ViewProps) {
  const t = useT();
  const facet = useFacet<DerivationFacet>('derivation');
  if (facet.status !== 'ready') {
    return (
      <p className="cv-view__status" role="status">
        {t(facet.status === 'loading' ? 'view.key-schedule.loading' : 'view.key-schedule.missing')}
      </p>
    );
  }
  return <KeySchedule facet={facet.data} />;
}
