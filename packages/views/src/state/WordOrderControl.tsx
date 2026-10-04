import { useT } from '@cryventure/viz';
import type { WordDisplay } from './wordByteOrder.ts';

export interface WordOrderControlProps {
  display: WordDisplay;
  /** Offer the "memory order" toggle (engineer lens); otherwise only the note is shown. */
  toggleable: boolean;
  onChange: (display: WordDisplay) => void;
}

/** Says how little-endian words are drawn and, in the engineer lens, switches to memory order. */
export function WordOrderControl({ display, toggleable, onChange }: WordOrderControlProps) {
  const t = useT();
  const memory = display === 'memory';
  return (
    <div className="cv-word-order" data-word-display={display}>
      {toggleable && (
        <button type="button" className="cv-word-order__toggle" aria-pressed={memory} onClick={() => onChange(memory ? 'integer' : 'memory')}>
          {t('view.state.wordOrder.memory')}
        </button>
      )}
      <p className="cv-word-order__note">{t(memory ? 'view.state.wordOrder.memoryNote' : 'view.state.wordOrder.integerNote')}</p>
    </div>
  );
}
