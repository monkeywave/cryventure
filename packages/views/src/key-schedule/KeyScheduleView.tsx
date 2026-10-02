import {
  memo,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ComponentProps,
  type KeyboardEvent,
  type ReactNode,
  type Ref,
} from 'react';
import { derivationNode, type DerivationFacet, type DerivationNode } from '@cryventure/core';
import { ViewStatus, useFacet, useLab, useLabActions, useT, type ViewProps } from '@cryventure/viz';
import {
  currentGroup,
  derivationChain,
  groupLabel,
  hostRows,
  resultGroups,
  rowStatus,
  wordHex,
  type ChainLink,
  type ResultGroup,
  type RowStatus,
} from './keyScheduleModel.ts';
import { createSourceMarks, type SourceMarks } from './sourceMarks.ts';
import './keySchedule.css';

/**
 * Key schedule (any `derivation` facet): result words grouped into rows headed by the producer's
 * group labels (wrapping at narrow widths), the most recently used group marked. Selecting a word
 * (click / Enter / Space) discloses its derivation chain inline, directly beneath the row that lists
 * it; selecting it again or Escape closes it. Hover and focus never change the layout: they only
 * mark the word's source words (`data-source`), re-rendering just the words whose mark flips.
 * Styled by `keySchedule.css` (class names only, no inline styles).
 */
const XOR_GLYPH = '⊕';
const ARROW_GLYPH = '→';
const CURRENT_GLYPH = '▸';

const STATUS_KEYS = { loading: 'view.key-schedule.loading', missing: 'view.key-schedule.missing' } as const;

/** Row heading per status; `{{group}}` is the group's label. Used rows show the label alone. */
const STATUS_LABEL_KEY: Readonly<Record<RowStatus, string | undefined>> = {
  current: 'view.key-schedule.groupCurrent',
  used: undefined,
  upcoming: 'view.key-schedule.groupUpcoming',
};

interface WordButtonProps {
  word: DerivationNode;
  expanded: boolean;
  chainId: string;
  onToggle: (id: string) => void;
  marks: SourceMarks;
}

const WordButton = memo(function WordButton({ word, expanded, chainId, onToggle, marks }: WordButtonProps) {
  const t = useT();
  const name = t(word.label);
  const hex = wordHex(word.bytes);
  const isSource = useSyncExternalStore(marks.subscribe, () => marks.isSource(word.id));
  const preview = () => marks.preview(word.id);
  const clearPreview = () => marks.preview(null);
  return (
    <button
      type="button"
      className="cv-keyschedule__word"
      aria-expanded={expanded}
      aria-controls={expanded ? chainId : undefined}
      aria-label={t('view.key-schedule.word', { name, hex })}
      title={name}
      data-node={word.id}
      data-source={isSource ? '' : undefined}
      onClick={() => onToggle(word.id)}
      onMouseEnter={preview}
      onMouseLeave={clearPreview}
      onFocus={preview}
      onBlur={clearPreview}
    >
      {hex}
    </button>
  );
});

/** The translated group label: the producer's (`DerivationFacet.groups`), else a generic one. */
function useGroupName(facet: DerivationFacet, group: number | undefined): string {
  const t = useT();
  const label = groupLabel(facet, group);
  if (label !== undefined) return t(label);
  return group === undefined ? t('view.key-schedule.ungrouped') : t('view.key-schedule.group', { n: group });
}

interface GroupItemProps {
  facet: DerivationFacet;
  row: ResultGroup;
  status: RowStatus;
  /** The selected word when this row lists it, else `null`. */
  selectedId: string | null;
  chainId: string;
  onToggle: (id: string) => void;
  marks: SourceMarks;
  /** The open derivation chain when this row lists the selected word. */
  children?: ReactNode;
}

const GroupItem = memo(function GroupItem({ facet, row, status, selectedId, chainId, onToggle, marks, children }: GroupItemProps) {
  const t = useT();
  const labelId = useId();
  const name = useGroupName(facet, row.group);
  const statusKey = STATUS_LABEL_KEY[status];
  const current = status === 'current';
  return (
    <li className="cv-keyschedule__row" data-status={status} aria-current={current ? 'step' : undefined}>
      <span id={labelId} className="cv-keyschedule__label">
        {current && <span aria-hidden="true">{CURRENT_GLYPH} </span>}
        {statusKey === undefined ? name : t(statusKey, { group: name })}
      </span>
      <ul className="cv-keyschedule__words" aria-labelledby={labelId}>
        {row.words.map((word) => (
          <li key={word.id}>
            <WordButton word={word} expanded={selectedId === word.id} chainId={chainId} onToggle={onToggle} marks={marks} />
          </li>
        ))}
      </ul>
      {children}
    </li>
  );
});

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
function LinkRows({ link, first, last }: { link: ChainLink; first: boolean; last: boolean }) {
  return (
    <>
      {link.operands.map((operand) => (
        <OperandRow key={operand.id} node={operand} />
      ))}
      <ChainRow glyph={first ? '' : ARROW_GLYPH} node={link.node} data-op={link.node.op} data-result={last ? '' : undefined} />
    </>
  );
}

function ChainBody({ links, name }: { links: ChainLink[]; name: string }) {
  const t = useT();
  if (links.length <= 1) return <p>{t('view.key-schedule.fromKey', { name })}</p>;
  return (
    <ol className="cv-keyschedule__links">
      {links.map((link, index) => (
        <LinkRows key={link.node.id} link={link} first={index === 0} last={index === links.length - 1} />
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
    <div id={id} ref={ref} className="cv-keyschedule__chain" role="region" aria-labelledby={titleId}>
      <p id={titleId} className="cv-keyschedule__chain-title">
        {t('view.key-schedule.chainTitle', { name })}
      </p>
      <ChainBody links={links} name={name} />
    </div>
  );
}

/** The single polite announcement of the current selection (empty when nothing is selected). */
function SelectionAnnouncer({ facet, word, host }: { facet: DerivationFacet; word: DerivationNode | undefined; host: ResultGroup | undefined }) {
  const t = useT();
  const group = useGroupName(facet, host?.group);
  const text = word === undefined ? '' : t('view.key-schedule.announceOpen', { name: t(word.label), group });
  return (
    <p className="cv-keyschedule__announcer" aria-live="polite">
      {text}
    </p>
  );
}

function prefersReducedMotion(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** Keeps a freshly opened chain in view without yanking the page (`block: 'nearest'`). */
function useRevealOnOpen(selectedId: string | null): Ref<HTMLDivElement> {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (selectedId === null) return;
    ref.current?.scrollIntoView?.({ block: 'nearest', behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
  }, [selectedId]);
  return ref;
}

/**
 * Selected word (one open chain at most), published as the lab's linked-brushing selection and to
 * the source marks. `toggle` is stable, so memoised rows and words never re-render because of it.
 */
function useSelectedWord(facet: DerivationFacet, marks: SourceMarks) {
  const { select } = useLabActions();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selectedRef = useRef<string | null>(null);
  const choose = useCallback(
    (id: string | null) => {
      selectedRef.current = id;
      setSelectedId(id);
      marks.select(id);
      select(id === null ? null : (derivationNode(facet, id)?.valueRef ?? null));
    },
    [facet, marks, select],
  );
  useCarrySelectionToNewFacet(facet, selectedRef, choose);
  const toggle = useCallback((id: string) => choose(selectedRef.current === id ? null : id), [choose]);
  const close = useCallback(() => choose(null), [choose]);
  return { selectedId, toggle, close };
}

/**
 * A new derivation facet (a re-run with new params) rebuilds the source marks and the lab clears its
 * `selection.valueRefId`. Node ids are path-derived (`w/50`), so the selection carries over exactly when
 * the new facet still has that node: it is re-chosen (re-publishing its valueRef and marks), otherwise
 * reset to none. The first facet (mount) leaves the lab selection untouched.
 */
function useCarrySelectionToNewFacet(facet: DerivationFacet, selectedRef: { readonly current: string | null }, choose: (id: string | null) => void) {
  const facetRef = useRef(facet);
  useEffect(() => {
    if (facetRef.current === facet) return;
    facetRef.current = facet;
    const id = selectedRef.current;
    if (id === null) return;
    choose(derivationNode(facet, id) === undefined ? null : id);
  }, [facet, selectedRef, choose]);
}

function KeySchedule({ facet }: { facet: DerivationFacet }) {
  const t = useT();
  const chainId = useId();
  const step = useLab((state) => state.step);
  const rows = useMemo(() => resultGroups(facet), [facet]);
  const hosts = useMemo(() => hostRows(rows), [rows]);
  const marks = useMemo(() => createSourceMarks(facet), [facet]);
  const { selectedId, toggle, close } = useSelectedWord(facet, marks);
  const selectedWord = selectedId === null ? undefined : derivationNode(facet, selectedId);
  const host = selectedId === null ? undefined : hosts.get(selectedId);
  const links = useMemo(() => (selectedId === null ? [] : derivationChain(facet, selectedId)), [facet, selectedId]);
  const chainRef = useRevealOnOpen(selectedId);
  const current = currentGroup(rows, step);
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key !== 'Escape' || selectedId === null) return;
    event.stopPropagation();
    close();
  };
  return (
    <section className="cv-keyschedule" aria-label={t('view.key-schedule.title')} onKeyDown={onKeyDown}>
      <p className="cv-keyschedule__hint">{t('view.key-schedule.hint')}</p>
      <ol className="cv-keyschedule__rows">
        {rows.map((row) => (
          <GroupItem
            key={row.group ?? 'ungrouped'}
            facet={facet}
            row={row}
            status={rowStatus(row, step, current)}
            selectedId={row === host ? selectedId : null}
            chainId={chainId}
            onToggle={toggle}
            marks={marks}
          >
            {row === host && selectedWord !== undefined && <ChainPanel id={chainId} word={selectedWord} links={links} ref={chainRef} />}
          </GroupItem>
        ))}
      </ol>
      <SelectionAnnouncer facet={facet} word={selectedWord} host={host} />
    </section>
  );
}

/** Result words of the `derivation` facet grouped into rows, with the derivation of one word. */
export default function KeyScheduleView(_props: ViewProps) {
  const facet = useFacet<DerivationFacet>('derivation');
  if (facet.status !== 'ready') return <ViewStatus status={facet.status} keys={STATUS_KEYS} />;
  return <KeySchedule facet={facet.data} />;
}
