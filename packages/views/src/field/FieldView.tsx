import { useId, useState } from 'react';
import { fieldStepAt, type FieldFacet, type FieldStep, type FieldTerm } from '@cryventure/core';
import { MathText, ViewStatus, useFacet, useLab, useT, type ViewProps } from '@cryventure/viz';
import {
  bitCellsOfByte,
  bitString,
  byteCells,
  columnsFor,
  OP_GLYPHS,
  reducesByR,
  spacedPolynomial,
  sparsePolynomial,
  type FieldByteCell,
  type FieldColumns,
} from './fieldModel.ts';
import './field.css';

/**
 * Field view (`field` facet, GF(2¹²⁸) for GHASH, docs/M4.md §3e): the equation of the latest field
 * step at the playhead, as a formula over its terms. Each term is a 16-byte strip (byte 0 first);
 * its bits (GCM order: bit i = coefficient of xⁱ, MSB of byte 0 first) open per term in the engineer
 * lens and are always shown in the cryptographer lens, which adds sparse polynomial notation, the
 * modulus and, when a step reduces, the constant R = e1 ‖ 0¹²⁰. The story lens hides hex. Emphasised
 * bits pair colour with an outline, an underline and a • marker on their byte. Before the first
 * field step, that step is previewed in a muted "upcoming" style under a start hint.
 */
const STATUS_KEYS = { loading: 'view.field.loading', missing: 'view.field.missing' } as const;

/** Marker on a byte holding emphasised bits (paired with an outline, never colour alone). */
const EMPHASIS_GLYPH = '•';

export default function FieldView({ lens }: ViewProps) {
  const facet = useFacet<FieldFacet>('field');
  if (facet.status !== 'ready') return <ViewStatus status={facet.status} keys={STATUS_KEYS} />;
  return <FieldPanel facet={facet.data} columns={columnsFor(lens)} />;
}

function FieldPanel({ facet, columns }: { facet: FieldFacet; columns: FieldColumns }) {
  const t = useT();
  const step = useLab((state) => state.step);
  const current = fieldStepAt(facet, step);
  const upcoming = current === undefined ? facet.steps[0] : undefined;
  const shown = current ?? upcoming;
  return (
    <section className="cv-view cv-field" aria-label={t('view.field.title')}>
      {columns.polynomial && (
        <p className="cv-field__modulus">
          <MathText text={t('view.field.modulus', { polynomial: spacedPolynomial(facet.notation.modulus) })} />
        </p>
      )}
      {current !== undefined && <FieldEquation fieldStep={current} columns={columns} />}
      {upcoming !== undefined && (
        <div className="cv-field__upcoming" data-upcoming="">
          <p className="cv-field__hint">{t('view.field.upcoming')}</p>
          <FieldEquation fieldStep={upcoming} columns={columns} />
        </div>
      )}
      {shown === undefined && <p className="cv-field__empty">{t('view.field.notYet')}</p>}
      {shown?.terms.some((term) => (term.bits?.length ?? 0) > 0) === true && (
        <p className="cv-field__legend">
          <span aria-hidden="true">{EMPHASIS_GLYPH} </span>
          {t('view.field.legendEmphasis')}
        </p>
      )}
    </section>
  );
}

function FieldEquation({ fieldStep, columns }: { fieldStep: FieldStep; columns: FieldColumns }) {
  const t = useT();
  return (
    <>
      <p className="cv-field__formula">
        <MathText text={t(fieldStep.formula)} />
      </p>
      {columns.polynomial && reducesByR(fieldStep) && (
        <p className="cv-field__reduction">
          <MathText text={t('view.field.reduction')} />
        </p>
      )}
      <ul className="cv-field__terms" aria-label={t('view.field.terms')}>
        {fieldStep.terms.map((term) => (
          <TermItem key={term.id} term={term} columns={columns} />
        ))}
      </ul>
    </>
  );
}

function TermItem({ term, columns }: { term: FieldTerm; columns: FieldColumns }) {
  const t = useT();
  const [expanded, setExpanded] = useState(false);
  const bitsId = useId();
  const label = t(term.label);
  const showBits = columns.bits === 'always' || (columns.bits === 'expand' && expanded);
  return (
    <li className="cv-field__term" data-role={term.role} data-term={term.id}>
      <span className="cv-field__head">
        <span className="cv-field__op">
          {term.op !== undefined && (
            <>
              <span aria-hidden="true">{OP_GLYPHS[term.op]}</span>
              <span className="cv-visually-hidden">{t(`view.field.op.${term.op}`)}</span>
            </>
          )}
        </span>
        <span className="cv-field__label">
          <MathText text={label} />
        </span>
        {columns.bits === 'expand' && (
          <button type="button" className="cv-field__toggle" aria-expanded={expanded} aria-controls={bitsId} onClick={() => setExpanded((open) => !open)}>
            {t(expanded ? 'view.field.hideBits' : 'view.field.showBits')}
          </button>
        )}
      </span>
      <ByteStrip term={term} label={label} hex={columns.hex} />
      {showBits && <BitStrip id={bitsId} term={term} label={label} />}
      {columns.polynomial && <Polynomial bytes={term.bytes} />}
    </li>
  );
}

function useByteLabel(hex: boolean): (cell: FieldByteCell) => string {
  const t = useT();
  return (cell) => {
    const byte = hex ? t('view.field.byte', { index: cell.index, hex: cell.hex }) : t('view.field.byteNoHex', { index: cell.index });
    if (cell.emphasisedBits.length === 0) return byte;
    return t('view.field.highlighted', { byte, count: cell.emphasisedBits.length, bits: cell.emphasisedBits.join(t('view.field.listSeparator')) });
  };
}

function ByteStrip({ term, label, hex }: { term: FieldTerm; label: string; hex: boolean }) {
  const t = useT();
  const byteLabel = useByteLabel(hex);
  return (
    <span className="cv-field__bytes" role="group" aria-label={t('view.field.bytesOf', { label })}>
      {byteCells(term).map((cell) => (
        <span key={cell.index} role="img" className="cv-field__byte" data-emphasised={cell.emphasisedBits.length > 0 || undefined} aria-label={byteLabel(cell)}>
          {hex ? cell.hex : null}
          {cell.emphasisedBits.length > 0 && <span className="cv-field__mark">{EMPHASIS_GLYPH}</span>}
        </span>
      ))}
    </span>
  );
}

function BitStrip({ id, term, label }: { id: string; term: FieldTerm; label: string }) {
  const t = useT();
  return (
    <span id={id} className="cv-field__bits" role="group" aria-label={t('view.field.bitsOf', { label })}>
      {byteCells(term).map(({ index, emphasisedBits }) => {
        const cells = bitCellsOfByte(term, index);
        const group = t('view.field.bitGroup', { from: cells[0]!.exponent, to: cells.at(-1)!.exponent, bits: bitString(cells) });
        const name = emphasisedBits.length === 0 ? group : t('view.field.highlighted', { byte: group, count: emphasisedBits.length, bits: emphasisedBits.join(t('view.field.listSeparator')) });
        return (
          <span key={index} role="img" className="cv-field__bitgroup" aria-label={name}>
            {cells.map((cell) => (
              <span key={cell.exponent} className="cv-field__bit" data-set={cell.set || undefined} data-emphasised={cell.emphasised || undefined}>
                {cell.set ? '1' : '0'}
              </span>
            ))}
          </span>
        );
      })}
    </span>
  );
}

function Polynomial({ bytes }: { bytes: readonly number[] }) {
  const t = useT();
  const { text, more } = sparsePolynomial(bytes);
  return (
    <p className="cv-field__poly">
      <MathText text={text} />
      {more > 0 && <span className="cv-field__more">{t('view.field.more', { count: more })}</span>}
    </p>
  );
}
