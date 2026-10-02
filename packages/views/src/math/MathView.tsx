import {
  mathStepAt,
  type Lens,
  type MathFacet,
  type MathStep,
  type MathTerm,
} from '@cryventure/core';
import { MathText, ViewStatus, useFacet, useLab, useT, type ViewProps } from '@cryventure/viz';
import {
  bitStrip,
  hexOf,
  OP_GLYPHS,
  polynomialOf,
  type BitCell,
} from './mathModel.ts';
import './math.css';

/**
 * Math view (any `math` facet): the equation of the latest math step at the playhead, as a formula
 * line over a table of terms (label, operator, bit strip MSB → LSB, hex). The lens decides the
 * depth: story = formula + hex, engineer adds bit strips, cryptographer adds polynomial notation
 * and the field modulus. Emphasised bits pair colour with an outline and underline; the carry bit
 * of a 9-bit product is set apart by a gap and dashed border. Caret exponents in formulas and labels
 * (`a^254`) render raised. Before the first math step, that step is previewed in a muted "upcoming"
 * style under a start hint. The table reflows with its container (`math.css`): polynomial under the
 * bits, then bits under the label, horizontal scrolling only as a last resort.
 */
const STATUS_KEYS = { loading: 'view.math.loading', missing: 'view.math.missing' } as const;

interface LensColumns {
  bits: boolean;
  polynomial: boolean;
}

function columnsFor(lens: Lens): LensColumns {
  return { bits: lens !== 'story', polynomial: lens === 'cryptographer' };
}

export default function MathView({ lens }: ViewProps) {
  const facet = useFacet<MathFacet>('math');
  if (facet.status !== 'ready') return <ViewStatus status={facet.status} keys={STATUS_KEYS} />;
  return <MathPanel facet={facet.data} columns={columnsFor(lens)} />;
}

function MathPanel({ facet, columns }: { facet: MathFacet; columns: LensColumns }) {
  const t = useT();
  const step = useLab((state) => state.step);
  const current = mathStepAt(facet, step);
  const upcoming = current === undefined ? facet.steps[0] : undefined;
  return (
    <section className="cv-view cv-math" aria-label={t('view.math.title')}>
      {columns.polynomial && (
        <p className="cv-math__modulus">
          {t('view.math.modulus', { polynomial: polynomialOf(facet.notation.modulus) })}
        </p>
      )}
      {current !== undefined && <MathEquation mathStep={current} columns={columns} />}
      {upcoming !== undefined && (
        <div className="cv-math__upcoming" data-upcoming="">
          <p className="cv-math__hint">{t('view.math.upcoming')}</p>
          <MathEquation mathStep={upcoming} columns={columns} />
        </div>
      )}
      {current === undefined && upcoming === undefined && (
        <p className="cv-math__empty">{t('view.math.notYet')}</p>
      )}
    </section>
  );
}

function MathEquation({ mathStep, columns }: { mathStep: MathStep; columns: LensColumns }) {
  const t = useT();
  return (
    <>
      <p className="cv-math__formula">
        <MathText text={t(mathStep.formula)} />
      </p>
      <div className="cv-math__scroll" role="region" tabIndex={0} aria-label={t('view.math.terms')}>
        <table
          role="table"
          className="cv-math__table"
          data-bits={columns.bits || undefined}
          data-polynomial={columns.polynomial || undefined}
        >
          <caption className="cv-math__sr">{t('view.math.terms')}</caption>
          <thead role="rowgroup">
            <tr role="row">
              <th scope="col" role="columnheader">
                {t('view.math.col.term')}
              </th>
              <th scope="col" role="columnheader">
                {t('view.math.col.op')}
              </th>
              {columns.bits && (
                <th scope="col" role="columnheader">
                  {t('view.math.col.bits')}
                </th>
              )}
              <th scope="col" role="columnheader">
                {t('view.math.col.hex')}
              </th>
              {columns.polynomial && (
                <th scope="col" role="columnheader">
                  {t('view.math.col.polynomial')}
                </th>
              )}
            </tr>
          </thead>
          <tbody role="rowgroup">
            {mathStep.terms.map((term) => (
              <TermRow key={term.id} term={term} columns={columns} />
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function TermRow({ term, columns }: { term: MathTerm; columns: LensColumns }) {
  const t = useT();
  return (
    <tr role="row" className="cv-math__row" data-role={term.role} data-term={term.id}>
      <th scope="row" role="rowheader" className="cv-math__label">
        <MathText text={t(term.label)} />
      </th>
      <td role="cell" className="cv-math__op">
        {term.op !== undefined && (
          <>
            <span aria-hidden="true">{OP_GLYPHS[term.op]}</span>
            <span className="cv-math__sr">{t(`view.math.op.${term.op}`)}</span>
          </>
        )}
      </td>
      {columns.bits && (
        <td role="cell" className="cv-math__bitcell">
          <BitStrip term={term} />
        </td>
      )}
      <td role="cell" className="cv-math__hex">
        <code>{hexOf(term.value, term.width)}</code>
      </td>
      {columns.polynomial && (
        <td role="cell" className="cv-math__poly">
          {polynomialOf(term.value)}
        </td>
      )}
    </tr>
  );
}

function BitStrip({ term }: { term: MathTerm }) {
  const t = useT();
  const label = (cell: BitCell) => {
    const bit = t(cell.carry ? 'view.math.carryBit' : 'view.math.bit', {
      position: cell.position,
      value: cell.set ? 1 : 0,
    });
    return cell.emphasised ? t('view.math.highlighted', { bit }) : bit;
  };
  return (
    <span className="cv-math__bits">
      {bitStrip(term).map((cell) => (
        <span
          key={cell.position}
          role="img"
          className="cv-math__bit"
          data-set={cell.set || undefined}
          data-emphasised={cell.emphasised || undefined}
          data-carry={cell.carry || undefined}
          aria-label={label(cell)}
        >
          {cell.set ? '1' : '0'}
        </span>
      ))}
    </span>
  );
}
