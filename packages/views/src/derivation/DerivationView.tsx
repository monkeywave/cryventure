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
import { derivationNode, type DerivationFacet, type DerivationNode, type LabZoom } from '@cryventure/core';
import { ViewStatus, useFacet, useLab, useLabActions, useT, type ViewProps } from '@cryventure/viz';
import {
  chainLineCount,
  currentGroup,
  derivationChain,
  groupLabel,
  hostRows,
  isWideValue,
  LONG_CHAIN_LINES,
  operandGlyph,
  opLabelKey,
  opTagShown,
  resultGroups,
  rowStatus,
  wordHex,
  type ChainLink,
  type ResultGroup,
  type RowStatus,
} from './derivationModel.ts';
import { createSourceMarks, type SourceMarks } from './sourceMarks.ts';
import './derivation.css';

/**
 * Derivation (any `derivation` facet: the AES key schedule, HKDF, PBKDF2, TLS PRFs …), headed by the
 * facet's `title` (else the view title): result values grouped into rows headed by the producer's
 * group labels (wrapping at narrow widths), the most recently used group marked. Selecting a word
 * (click / Enter / Space) discloses its derivation chain inline, directly beneath the row that lists
 * it; selecting it again or Escape closes it. Hover and focus never change the layout: they only
 * mark the word's source words (`data-source`), re-rendering just the words whose mark flips.
 * Chain lines name their op from the view's catalog (raw op name otherwise); a node with a `zoom`
 * links to that lab via the host's `labHref` (no link without one), named by the host's `labTitle`.
 * Values wider than an AES word show their name on their button and wrap below it in the chain;
 * only long chains scroll (vertically, in a focusable panel).
 * Styled by `derivation.css` (class names only, no inline styles).
 */
const ARROW_GLYPH = '→';
const CURRENT_GLYPH = '▸';

const STATUS_KEYS = { loading: 'view.derivation.loading', missing: 'view.derivation.missing' } as const;

/** Row heading per status; `{{group}}` is the group's label. Used rows show the label alone. */
const STATUS_LABEL_KEY: Readonly<Record<RowStatus, string | undefined>> = {
  current: 'view.derivation.groupCurrent',
  used: undefined,
  upcoming: 'view.derivation.groupUpcoming',
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
  const wide = isWideValue(word.bytes);
  return (
    <button
      type="button"
      className="cv-derivation__word"
      data-wide={wide ? '' : undefined}
      aria-expanded={expanded}
      aria-controls={expanded ? chainId : undefined}
      aria-label={t('view.derivation.word', { name, hex })}
      title={name}
      data-node={word.id}
      data-source={isSource ? '' : undefined}
      onClick={() => onToggle(word.id)}
      onMouseEnter={preview}
      onMouseLeave={clearPreview}
      onFocus={preview}
      onBlur={clearPreview}
    >
      {wide ? (
        <>
          <span className="cv-derivation__word-name">{name}</span>
          <span className="cv-derivation__word-hex">{hex}</span>
        </>
      ) : (
        hex
      )}
    </button>
  );
});

/** The translated group label: the producer's (`DerivationFacet.groups`), else a generic one. */
function useGroupName(facet: DerivationFacet, group: number | undefined): string {
  const t = useT();
  const label = groupLabel(facet, group);
  if (label !== undefined) return t(label);
  return group === undefined ? t('view.derivation.ungrouped') : t('view.derivation.group', { n: group });
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
    <li className="cv-derivation__row" data-status={status} aria-current={current ? 'step' : undefined}>
      <span id={labelId} className="cv-derivation__label">
        {current && <span aria-hidden="true">{CURRENT_GLYPH} </span>}
        {statusKey === undefined ? name : t(statusKey, { group: name })}
      </span>
      <ul className="cv-derivation__words" aria-labelledby={labelId}>
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

/** The op's name from the view's catalog, else the raw op (e.g. a producer-specific `pbkdf2Iteration`). */
function useOpLabel(op: string): string {
  const t = useT();
  const key = opLabelKey(op);
  return key === undefined ? op : t(key);
}

/** The host's link to the lab computing a node (`useLabActions().labHref`); `undefined` = no link. */
function useZoomHref(zoom: LabZoom | undefined): string | undefined {
  const { labHref } = useLabActions();
  return zoom === undefined ? undefined : labHref?.(zoom);
}

/**
 * The zoom link's visible text: "Open the lab “HMAC …”" when the host names the target lab
 * (`useLabActions().labTitle`) and its title ships with this lab's messages, else the generic text.
 */
function useZoomText(zoom: LabZoom | undefined): string {
  const t = useT();
  const { labTitle } = useLabActions();
  const titleKey = zoom === undefined ? undefined : labTitle?.(zoom.producerId);
  const title = titleKey === undefined ? undefined : t(titleKey);
  // The translator echoes a key it has no message for: then the title is unknown here.
  return title === undefined || title === titleKey ? t('view.derivation.zoom') : t('view.derivation.zoomTitled', { lab: title });
}

/** "Open the lab “…”"; its accessible name starts with that visible text (WCAG 2.5.3) and adds the node it computes. */
function ZoomLink({ node }: { node: DerivationNode }) {
  const t = useT();
  const href = useZoomHref(node.zoom);
  const text = useZoomText(node.zoom);
  if (href === undefined) return null;
  return (
    <a className="cv-derivation__zoom" href={href} aria-label={t('view.derivation.zoomLabel', { link: text, name: t(node.label) })}>
      {text}
    </a>
  );
}

interface ChainRowProps extends Omit<ComponentProps<'li'>, 'children'> {
  glyph: string;
  node: DerivationNode;
  /** The op that produced `node`, shown before its name (omitted for the chain's starting value). */
  op?: string;
}

/** One line of the chain: a glyph column, the op (unless the name already says it), the value's name and its hex (FIPS 197 Appendix A layout). */
function ChainRow({ glyph, node, op, ...rest }: ChainRowProps) {
  const t = useT();
  const label = t(node.label);
  return (
    <li className="cv-derivation__link" data-wide={isWideValue(node.bytes) ? '' : undefined} {...rest}>
      <span className="cv-derivation__glyph" aria-hidden="true">
        {glyph}
      </span>
      <span className="cv-derivation__name">
        {op !== undefined && <OpTag op={op} label={label} />}
        {label}
      </span>{' '}
      <code className="cv-derivation__hex">{wordHex(node.bytes)}</code>
      <ZoomLink node={node} />
    </li>
  );
}

/** The op's name in front of `label`, unless the label already names it (`opTagShown`). */
function OpTag({ op, label }: { op: string; label: string }) {
  const opLabel = useOpLabel(op);
  return opTagShown(op, opLabel, label) ? <span className="cv-derivation__op">{opLabel}</span> : null;
}

/** An operand combined into `into` (e.g. XORed), announced as "XOR with Rcon[1] (01000000)". */
function OperandRow({ node, into }: { node: DerivationNode; into: string }) {
  const t = useT();
  const label = t('view.derivation.operand', { op: useOpLabel(into), name: t(node.label), hex: wordHex(node.bytes) });
  return <ChainRow glyph={operandGlyph(into)} node={node} aria-label={label} data-operand="" />;
}

/** Operands on their own lines, then the value they produce (`→`, with its op); the first link has neither. */
function LinkRows({ link, first, last }: { link: ChainLink; first: boolean; last: boolean }) {
  const { node } = link;
  return (
    <>
      {link.operands.map((operand) => (
        <OperandRow key={operand.id} node={operand} into={node.op} />
      ))}
      <ChainRow glyph={first ? '' : ARROW_GLYPH} node={node} op={first ? undefined : node.op} data-op={node.op} data-result={last ? '' : undefined} />
    </>
  );
}

function ChainBody({ links, name }: { links: ChainLink[]; name: string }) {
  const t = useT();
  if (links.length <= 1) return <p>{t('view.derivation.input', { name })}</p>;
  return (
    <ol className="cv-derivation__links">
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
  // Only a long chain scrolls (inside its own box; wide values wrap instead), so only it needs to be reachable by keyboard.
  const long = chainLineCount(links) > LONG_CHAIN_LINES;
  return (
    <div
      id={id}
      ref={ref}
      className="cv-derivation__chain"
      role="region"
      aria-labelledby={titleId}
      data-long={long ? '' : undefined}
      tabIndex={long ? 0 : undefined}
    >
      <p id={titleId} className="cv-derivation__chain-title">
        {t('view.derivation.chainTitle', { name })}
      </p>
      <ChainBody links={links} name={name} />
    </div>
  );
}

/** The single polite announcement of the current selection (empty when nothing is selected). */
function SelectionAnnouncer({ facet, word, host }: { facet: DerivationFacet; word: DerivationNode | undefined; host: ResultGroup | undefined }) {
  const t = useT();
  const group = useGroupName(facet, host?.group);
  const text = word === undefined ? '' : t('view.derivation.announceOpen', { name: t(word.label), group });
  return (
    <p className="cv-derivation__announcer" aria-live="polite">
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

function Derivation({ facet }: { facet: DerivationFacet }) {
  const t = useT();
  const chainId = useId();
  const titleId = useId();
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
    <section className="cv-derivation" aria-labelledby={titleId} onKeyDown={onKeyDown}>
      <p id={titleId} className="cv-derivation__title">
        {t(facet.title ?? 'view.derivation.title')}
      </p>
      <p className="cv-derivation__hint">{t('view.derivation.hint')}</p>
      <ol className="cv-derivation__rows">
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

/** Result values of the `derivation` facet grouped into rows, with the derivation of one value. */
export default function DerivationView(_props: ViewProps) {
  const facet = useFacet<DerivationFacet>('derivation');
  if (facet.status !== 'ready') return <ViewStatus status={facet.status} keys={STATUS_KEYS} />;
  return <Derivation facet={facet.data} />;
}
