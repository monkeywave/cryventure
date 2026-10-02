import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ComponentProps,
  type KeyboardEvent,
  type ReactNode,
  type Ref,
} from 'react';
import { derivationNode, type DerivationFacet, type DerivationNode } from '@cryventure/core';
import { useFacet, useLab, useLabActions, useT, type ViewProps } from '@cryventure/viz';
import {
  currentGroup,
  derivationChain,
  hostGroup,
  roundKeyRows,
  rowStatus,
  sourceWordIds,
  wordHex,
  type ChainLink,
  type RoundKeyRow,
  type RowStatus,
} from './keyScheduleModel.ts';

/**
 * Key schedule: round keys as rows of words (wrapping at narrow widths), the most recently used
 * round key marked. Selecting a word (click / Enter / Space) discloses its derivation chain inline,
 * directly beneath the round key that lists it; selecting it again or Escape closes it. Hover and
 * focus never change the layout: they only mark the word's source words (`data-source`).
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

/** What a word button needs to render its state and report interaction. */
interface WordInteraction {
  selectedId: string | null;
  sourceIds: ReadonlySet<string>;
  chainId: string;
  toggle: (id: string) => void;
  preview: (id: string | null) => void;
}

function WordButton({ word, interaction }: { word: DerivationNode; interaction: WordInteraction }) {
  const t = useT();
  const name = t(word.label);
  const hex = wordHex(word.bytes);
  const expanded = interaction.selectedId === word.id;
  return (
    <button
      type="button"
      className="cv-keyschedule__word"
      aria-expanded={expanded}
      aria-controls={expanded ? interaction.chainId : undefined}
      aria-label={t('view.key-schedule.word', { name, hex })}
      title={name}
      data-node={word.id}
      data-source={interaction.sourceIds.has(word.id) ? '' : undefined}
      onClick={() => interaction.toggle(word.id)}
      onMouseEnter={() => interaction.preview(word.id)}
      onMouseLeave={() => interaction.preview(null)}
      onFocus={() => interaction.preview(word.id)}
      onBlur={() => interaction.preview(null)}
    >
      {hex}
    </button>
  );
}

interface RoundKeyItemProps {
  row: RoundKeyRow;
  status: RowStatus;
  interaction: WordInteraction;
  /** The open derivation chain when this row lists the selected word. */
  children?: ReactNode;
}

function RoundKeyItem({ row, status, interaction, children }: RoundKeyItemProps) {
  const t = useT();
  const labelId = useId();
  const current = status === 'current';
  return (
    <li
      className="cv-keyschedule__row"
      data-status={status}
      aria-current={current ? 'step' : undefined}
    >
      <span id={labelId} className="cv-keyschedule__label">
        {current && <span aria-hidden="true">{CURRENT_GLYPH} </span>}
        {t(ROW_LABEL_KEY[status], { round: row.group })}
      </span>
      <ul className="cv-keyschedule__words" aria-labelledby={labelId}>
        {row.words.map((word) => (
          <li key={word.id}>
            <WordButton word={word} interaction={interaction} />
          </li>
        ))}
      </ul>
      {children}
    </li>
  );
}

/** One line of the chain: a glyph column, the value's name and its hex (FIPS 197 Appendix A layout). */
function ChainRow({
  glyph,
  node,
  ...rest
}: { glyph: string; node: DerivationNode } & Omit<ComponentProps<'li'>, 'children'>) {
  const t = useT();
  return (
    <li className="cv-keyschedule__link" {...rest}>
      <span className="cv-keyschedule__glyph" aria-hidden="true">
        {glyph}
      </span>
      <span className="cv-keyschedule__name">{t(node.label)}</span>{' '}
      <code className="cv-keyschedule__hex">{wordHex(node.bytes)}</code>
    </li>
  );
}

function OperandRow({ node }: { node: DerivationNode }) {
  const t = useT();
  const label = t('view.key-schedule.xorWith', { name: t(node.label), hex: wordHex(node.bytes) });
  return <ChainRow glyph={XOR_GLYPH} node={node} aria-label={label} data-operand="" />;
}

/** XOR operands on their own lines, then the value they produce (`→`); the first link has no glyph. */
function LinkRows({ link, first, last }: { link: ChainLink; first: boolean; last: boolean }) {
  return (
    <>
      {link.operands.map((operand) => (
        <OperandRow key={operand.id} node={operand} />
      ))}
      <ChainRow
        glyph={first ? '' : ARROW_GLYPH}
        node={link.node}
        data-op={link.node.op}
        data-result={last ? '' : undefined}
      />
    </>
  );
}

function ChainBody({ links, name }: { links: ChainLink[]; name: string }) {
  const t = useT();
  if (links.length <= 1) return <p>{t('view.key-schedule.fromKey', { name })}</p>;
  return (
    <ol className="cv-keyschedule__links">
      {links.map((link, index) => (
        <LinkRows
          key={link.node.id}
          link={link}
          first={index === 0}
          last={index === links.length - 1}
        />
      ))}
    </ol>
  );
}

interface ChainPanelProps {
  id: string;
  word: DerivationNode;
  links: ChainLink[];
  ref: Ref<HTMLDivElement>;
}

/** The inline disclosure of one word's derivation, labelled "How w[i] is derived". */
function ChainPanel({ id, word, links, ref }: ChainPanelProps) {
  const t = useT();
  const titleId = useId();
  const name = t(word.label);
  return (
    <div
      id={id}
      ref={ref}
      className="cv-keyschedule__chain"
      role="region"
      aria-labelledby={titleId}
    >
      <p id={titleId} className="cv-keyschedule__chain-title">
        {t('view.key-schedule.chainTitle', { name })}
      </p>
      <ChainBody links={links} name={name} />
    </div>
  );
}

/** The single polite announcement of the current selection (empty when nothing is selected). */
function SelectionAnnouncer({
  word,
  round,
}: {
  word: DerivationNode | undefined;
  round: number | undefined;
}) {
  const t = useT();
  const text =
    word === undefined
      ? ''
      : t('view.key-schedule.announceOpen', { name: t(word.label), round: round ?? '' });
  return (
    <p className="cv-keyschedule__announcer" aria-live="polite">
      {text}
    </p>
  );
}

function prefersReducedMotion(): boolean {
  return (
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

/** Keeps a freshly opened chain in view without yanking the page (`block: 'nearest'`). */
function useRevealOnOpen(selectedId: string | null): Ref<HTMLDivElement> {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (selectedId === null) return;
    ref.current?.scrollIntoView?.({
      block: 'nearest',
      behavior: prefersReducedMotion() ? 'auto' : 'smooth',
    });
  }, [selectedId]);
  return ref;
}

/** Selected word (one open chain at most), published as the lab's linked-brushing selection. */
function useSelectedWord(facet: DerivationFacet) {
  const { select } = useLabActions();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const choose = (id: string | null) => {
    setSelectedId(id);
    select(id === null ? null : (derivationNode(facet, id)?.valueRef ?? null));
  };
  return {
    selectedId,
    toggle: (id: string) => choose(selectedId === id ? null : id),
    close: () => choose(null),
  };
}

function useWordInteraction(facet: DerivationFacet) {
  const chainId = useId();
  const selection = useSelectedWord(facet);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const markedId = previewId ?? selection.selectedId;
  const sourceIds = useMemo(
    () => new Set(markedId === null ? [] : sourceWordIds(facet, markedId)),
    [facet, markedId],
  );
  const interaction: WordInteraction = {
    selectedId: selection.selectedId,
    sourceIds,
    chainId,
    toggle: selection.toggle,
    preview: setPreviewId,
  };
  return { interaction, close: selection.close };
}

function KeySchedule({ facet }: { facet: DerivationFacet }) {
  const t = useT();
  const step = useLab((state) => state.step);
  const rows = useMemo(() => roundKeyRows(facet), [facet]);
  const { interaction, close } = useWordInteraction(facet);
  const { selectedId } = interaction;
  const selectedWord = selectedId === null ? undefined : derivationNode(facet, selectedId);
  const host = selectedId === null ? undefined : hostGroup(rows, selectedId);
  const links = useMemo(
    () => (selectedId === null ? [] : derivationChain(facet, selectedId)),
    [facet, selectedId],
  );
  const chainRef = useRevealOnOpen(selectedId);
  const current = currentGroup(rows, step);
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key !== 'Escape' || selectedId === null) return;
    event.stopPropagation();
    close();
  };
  return (
    <section
      className="cv-keyschedule"
      aria-label={t('view.key-schedule.title')}
      onKeyDown={onKeyDown}
    >
      <p className="cv-keyschedule__hint">{t('view.key-schedule.hint')}</p>
      <ol className="cv-keyschedule__rows">
        {rows.map((row) => (
          <RoundKeyItem
            key={row.group}
            row={row}
            status={rowStatus(row, step, current)}
            interaction={interaction}
          >
            {row.group === host && selectedWord !== undefined && (
              <ChainPanel
                id={interaction.chainId}
                word={selectedWord}
                links={links}
                ref={chainRef}
              />
            )}
          </RoundKeyItem>
        ))}
      </ol>
      <SelectionAnnouncer word={selectedWord} round={host} />
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
