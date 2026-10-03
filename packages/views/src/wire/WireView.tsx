import { memo, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type RefCallback } from 'react';
import { isWireSegmentAvailable, toHex, wireTotalLength, type Lens, type WireFacet } from '@cryventure/core';
import { ViewStatus, useFacet, useLab, useT, type ViewProps } from '@cryventure/viz';
import { BYTES_PER_ROW, fitBytesPerRow, offsetLabel, placeSegments, ROLE_GLYPHS, wireChangeStep, type PlacedSegment } from './wireModel.ts';
import './wire.css';

/**
 * Bytes as they travel (`wire` facet): a packet-like strip of byte boxes grouped by segment, each
 * segment with its role colour, glyph and border, its label and an offsets ruler (row gutter); rows
 * hold 16, 8 or 4 bytes as the strip's width allows (boxes never shrink below their minimum), and
 * segments flow side by side. Each segment's summary is visually hidden text, so browse modes read it. The offsets the facet
 * highlights at the playhead get a heavy border. Segments not sent yet at the playhead (before their
 * `availableAt`) are dashed and dimmed with `··` placeholders, like the state view's unwritten cells. `flip` is shown read-only (↯ on flipped bytes);
 * interactive flipping arrives with the attack labs. Story lens: boxes without hex.
 */
const STATUS_KEYS = { loading: 'view.wire.loading', missing: 'view.wire.missing' } as const;

const FLIP_GLYPH = '↯';
/** Placeholder of a byte not sent yet (the state view's convention for unwritten cells). */
const PENDING_TEXT = '··';

interface ByteBoxProps {
  offset: number;
  value: number;
  active: boolean;
  flipped: boolean;
  showHex: boolean;
  pending: boolean;
}

/** One byte; primitive props, so only the boxes whose state changes re-render on a step. */
const ByteBox = memo(function ByteBox({ offset, value, active, flipped, showHex, pending }: ByteBoxProps) {
  if (pending) {
    return (
      <span className="cv-wire__byte" data-offset={offset}>
        {PENDING_TEXT}
      </span>
    );
  }
  return (
    <span className="cv-wire__byte" data-offset={offset} data-active={active ? '' : undefined} data-flipped={flipped ? '' : undefined}>
      {showHex ? toHex([value]) : null}
      {flipped && <span className="cv-wire__flip">{FLIP_GLYPH}</span>}
    </span>
  );
});

/** Bytes per row (16, 8 or 4) fitting the width of the element behind the returned ref. */
function useBytesPerRow<T extends HTMLElement>(): [RefCallback<T>, number] {
  const [bytesPerRow, setBytesPerRow] = useState(BYTES_PER_ROW);
  const stopRef = useRef<() => void>(() => {});
  const ref = useCallback((element: T | null) => {
    stopRef.current();
    stopRef.current = () => {};
    if (element === null) return;
    const fit = (width: number) => setBytesPerRow(fitBytesPerRow(width, parseFloat(getComputedStyle(element).fontSize) || 16));
    fit(element.getBoundingClientRect().width);
    if (typeof ResizeObserver !== 'function') return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries.at(-1);
      if (entry !== undefined) fit(entry.contentRect.width);
    });
    observer.observe(element);
    stopRef.current = () => observer.disconnect();
  }, []);
  useEffect(() => () => stopRef.current(), []);
  return [ref, bytesPerRow];
}

function useSegmentLabel(placed: PlacedSegment, total: number, lens: Lens): string {
  const t = useT();
  const { segment, start, pending, activeCount, flippedCount } = placed;
  let summary = t('view.wire.segment', {
    label: t(segment.label),
    role: t(`view.wire.role.${segment.role}`),
    bytes: segment.bytes.length,
    from: offsetLabel(start, total),
    to: offsetLabel(start + segment.bytes.length - 1, total),
  });
  if (pending) return t('view.wire.segmentPending', { summary });
  if (lens !== 'story') summary = t('view.wire.segmentHex', { summary, hex: toHex(segment.bytes, { group: 4 }) });
  if (activeCount > 0) summary = t('view.wire.segmentActive', { summary, count: activeCount });
  if (flippedCount > 0) summary = t('view.wire.segmentFlipped', { summary, count: flippedCount });
  return summary;
}

function Segment({ placed, total, lens }: { placed: PlacedSegment; total: number; lens: Lens }) {
  const t = useT();
  const { segment, start, rows, pending, activeCount } = placed;
  const end = start + segment.bytes.length - 1;
  return (
    <li
      className="cv-wire__segment"
      data-segment={segment.id}
      data-role={segment.role}
      data-active={activeCount > 0 ? '' : undefined}
      data-pending={pending ? '' : undefined}
      style={{ '--cv-wire-cols': rows[0]?.length ?? 1 } as CSSProperties}
    >
      <span className="cv-visually-hidden">{useSegmentLabel(placed, total, lens)}</span>
      <span className="cv-wire__header" aria-hidden="true">
        <span className="cv-wire__glyph">{ROLE_GLYPHS[segment.role]}</span>
        <span className="cv-wire__label">{t(segment.label)}</span>
        <span className="cv-wire__range">{t('view.wire.range', { bytes: segment.bytes.length, from: offsetLabel(start, total), to: offsetLabel(end, total) })}</span>
      </span>
      <span className="cv-wire__rows" aria-hidden="true">
        {rows.map((row) => (
          <span key={row[0]?.offset} className="cv-wire__row">
            <span className="cv-wire__offset">{offsetLabel(row[0]?.offset ?? start, total)}</span>
            {row.map((byte) => (
              <ByteBox
                key={byte.offset}
                offset={byte.offset}
                value={byte.value}
                active={byte.active}
                flipped={byte.flipMask !== 0}
                showHex={lens !== 'story'}
                pending={pending}
              />
            ))}
          </span>
        ))}
      </span>
    </li>
  );
}

function Wire({ facet, lens }: { facet: WireFacet; lens: Lens }) {
  const t = useT();
  const step = useLab((state) => state.step);
  const [stripRef, bytesPerRow] = useBytesPerRow<HTMLOListElement>();
  // Placement changes only at highlight/availability changes: memoised on that step, not every step.
  const changeStep = wireChangeStep(facet, step);
  const segments = useMemo(() => placeSegments(facet, changeStep, bytesPerRow), [facet, changeStep, bytesPerRow]);
  const total = wireTotalLength(facet);
  const sendsLater = facet.segments.some((segment) => !isWireSegmentAvailable(segment, -1));
  return (
    <section className="cv-view cv-wire" aria-label={t('view.wire.title')} data-lens={lens}>
      <ol ref={stripRef} className="cv-wire__strip" aria-label={t('view.wire.strip', { count: facet.segments.length, bytes: total })}>
        {segments.map((placed) => (
          <Segment key={placed.segment.id} placed={placed} total={total} lens={lens} />
        ))}
      </ol>
      <p className="cv-wire__legend">
        <span data-active="">{t('view.wire.legendActive')}</span>
        {sendsLater && <span data-pending="">{t('view.wire.legendPending')}</span>}
        {facet.flip !== undefined && (
          <span>
            <span aria-hidden="true">{FLIP_GLYPH} </span>
            {t('view.wire.legendFlip')}
          </span>
        )}
      </p>
    </section>
  );
}

/** The bytes a block mode sends, highlighted at the playhead. */
export default function WireView({ lens }: ViewProps) {
  const facet = useFacet<WireFacet>('wire');
  if (facet.status !== 'ready') return <ViewStatus status={facet.status} keys={STATUS_KEYS} />;
  return <Wire facet={facet.data} lens={lens} />;
}
