import { memo, useMemo, type CSSProperties } from 'react';
import { toHex, wireTotalLength, type Lens, type WireFacet } from '@cryventure/core';
import { ViewStatus, useFacet, useLab, useT, type ViewProps } from '@cryventure/viz';
import { offsetLabel, placeSegments, ROLE_GLYPHS, type PlacedByte, type PlacedSegment } from './wireModel.ts';
import './wire.css';

/**
 * Bytes as they travel (`wire` facet): a packet-like strip of byte boxes grouped by segment, each
 * segment with its role colour, glyph and border, its label and an offsets ruler (row gutter); rows
 * hold at most 16 bytes, and segments flow side by side as the panel allows. The offsets the facet
 * highlights at the playhead get a heavy border. `flip` is shown read-only (↯ on flipped bytes);
 * interactive flipping arrives with the attack labs. Story lens: boxes without hex.
 */
const STATUS_KEYS = { loading: 'view.wire.loading', missing: 'view.wire.missing' } as const;

const FLIP_GLYPH = '↯';

const ByteBox = memo(function ByteBox({ byte, showHex }: { byte: PlacedByte; showHex: boolean }) {
  return (
    <span className="cv-wire__byte" data-offset={byte.offset} data-active={byte.active ? '' : undefined} data-flipped={byte.flipMask === 0 ? undefined : ''}>
      {showHex ? toHex([byte.value]) : null}
      {byte.flipMask !== 0 && <span className="cv-wire__flip">{FLIP_GLYPH}</span>}
    </span>
  );
});

function useSegmentLabel(placed: PlacedSegment, total: number, lens: Lens): string {
  const t = useT();
  const { segment, start, activeCount, flippedCount } = placed;
  let summary = t('view.wire.segment', {
    label: t(segment.label),
    role: t(`view.wire.role.${segment.role}`),
    bytes: segment.bytes.length,
    from: offsetLabel(start, total),
    to: offsetLabel(start + segment.bytes.length - 1, total),
  });
  if (lens !== 'story') summary = t('view.wire.segmentHex', { summary, hex: toHex(segment.bytes, { group: 4 }) });
  if (activeCount > 0) summary = t('view.wire.segmentActive', { summary, count: activeCount });
  if (flippedCount > 0) summary = t('view.wire.segmentFlipped', { summary, count: flippedCount });
  return summary;
}

function Segment({ placed, total, lens }: { placed: PlacedSegment; total: number; lens: Lens }) {
  const t = useT();
  const { segment, start, rows, activeCount } = placed;
  const end = start + segment.bytes.length - 1;
  return (
    <li
      className="cv-wire__segment"
      data-segment={segment.id}
      data-role={segment.role}
      data-active={activeCount > 0 ? '' : undefined}
      aria-label={useSegmentLabel(placed, total, lens)}
      style={{ '--cv-wire-cols': rows[0]?.length ?? 1 } as CSSProperties}
    >
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
              <ByteBox key={byte.offset} byte={byte} showHex={lens !== 'story'} />
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
  const segments = useMemo(() => placeSegments(facet, step), [facet, step]);
  const total = wireTotalLength(facet);
  return (
    <section className="cv-view cv-wire" aria-label={t('view.wire.title')} data-lens={lens}>
      <ol className="cv-wire__strip" aria-label={t('view.wire.strip', { count: total, segments: facet.segments.length })}>
        {segments.map((placed) => (
          <Segment key={placed.segment.id} placed={placed} total={total} lens={lens} />
        ))}
      </ol>
      <p className="cv-wire__legend">
        <span data-active="">{t('view.wire.legendActive')}</span>
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
